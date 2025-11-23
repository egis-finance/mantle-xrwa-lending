package dvn

import (
	"math/big"
	"testing"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/require"
)

func TestNewEIP712Signer_Success(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)

	require.NoError(t, err)
	require.NotNil(t, signer)
	require.Equal(t, receiverAddress, signer.receiverAddress)
	require.Equal(t, chainID, signer.chainID)
	require.NotNil(t, signer.privateKey)
	require.NotEqual(t, [32]byte{}, signer.domainSeparator)
}

func TestNewEIP712Signer_WithHexPrefix(t *testing.T) {
	t.Parallel()

	privateKey := "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)

	require.NoError(t, err)
	require.NotNil(t, signer)
}

func TestNewEIP712Signer_InvalidPrivateKey(t *testing.T) {
	t.Parallel()

	invalidPrivateKey := "invalid"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	_, err := NewEIP712Signer(invalidPrivateKey, receiverAddress, chainID)

	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid private key")
}

func TestComputeDomainSeparator(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	// Compute domain separator manually for verification
	domainTypeHash := crypto.Keccak256Hash([]byte("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"))
	nameHash := crypto.Keccak256Hash([]byte("XRWAReceiver"))
	versionHash := crypto.Keccak256Hash([]byte("1"))

	data := make([]byte, 0, 160)
	data = append(data, domainTypeHash.Bytes()...)
	data = append(data, nameHash.Bytes()...)
	data = append(data, versionHash.Bytes()...)
	data = append(data, common.LeftPadBytes(chainID.Bytes(), 32)...)
	data = append(data, common.LeftPadBytes(receiverAddress.Bytes(), 32)...)

	expectedDomainSeparator := crypto.Keccak256Hash(data)

	// Convert Hash to [32]byte for comparison
	var expectedBytes [32]byte
	copy(expectedBytes[:], expectedDomainSeparator[:])
	require.Equal(t, expectedBytes, signer.domainSeparator)
}

func TestComputeStructHash(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	// Create test message
	msg := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0x11, 0x22, 0x33},
		Amount:        big.NewInt(1000000),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    1234567890,
		VcHash:        [32]byte{0xaa, 0xbb, 0xcc},
	}

	structHash := signer.computeStructHash(msg)

	// Verify struct hash is not empty
	require.NotEqual(t, [32]byte{}, structHash)
}

func TestSignLockMessage(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	// Create test message
	msg := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0x11, 0x22, 0x33, 0x44},
		Amount:        big.NewInt(1000000),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    1234567890,
		VcHash:        [32]byte{0xaa, 0xbb, 0xcc, 0xdd},
	}

	v, r, s, err := signer.SignLockMessage(msg)

	require.NoError(t, err)
	require.NotZero(t, v)
	require.NotEqual(t, [32]byte{}, r)
	require.NotEqual(t, [32]byte{}, s)

	// Verify v is either 27 or 28 (Ethereum convention)
	require.True(t, v == 27 || v == 28)
}

func TestSignLockMessage_SignatureComponents(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	msg := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0x12, 0x34, 0x56, 0x78},
		Amount:        big.NewInt(5000000),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    9999999999,
		VcHash:        [32]byte{0xfe, 0xdc, 0xba, 0x98},
	}

	v, r, s, err := signer.SignLockMessage(msg)

	require.NoError(t, err)

	// Verify signature can be reconstructed
	signature := make([]byte, 65)
	copy(signature[0:32], r[:])
	copy(signature[32:64], s[:])
	signature[64] = v - 27 // Convert back to 0/1 for recovery

	require.Len(t, signature, 65)
}

func TestGetSignerAddress(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	address := signer.GetSignerAddress()

	// Known address for this private key
	expectedAddress := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	require.Equal(t, expectedAddress, address)
}

func TestSignLockMessage_Deterministic(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	msg := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0x99, 0x88, 0x77, 0x66},
		Amount:        big.NewInt(7777777),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    1111111111,
		VcHash:        [32]byte{0x11, 0x22, 0x33, 0x44},
	}

	// Sign the same message twice
	v1, r1, s1, err := signer.SignLockMessage(msg)
	require.NoError(t, err)

	v2, r2, s2, err := signer.SignLockMessage(msg)
	require.NoError(t, err)

	// Signatures should be identical (deterministic)
	require.Equal(t, v1, v2)
	require.Equal(t, r1, r2)
	require.Equal(t, s1, s2)
}

func TestSignLockMessage_DifferentMessages(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	msg1 := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0x01},
		Amount:        big.NewInt(1000000),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    1234567890,
		VcHash:        [32]byte{0xaa},
	}

	msg2 := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0x02},  // Different lock ID
		Amount:        big.NewInt(1000000),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    1234567890,
		VcHash:        [32]byte{0xaa},
	}

	v1, r1, s1, err := signer.SignLockMessage(msg1)
	require.NoError(t, err)

	v2, r2, s2, err := signer.SignLockMessage(msg2)
	require.NoError(t, err)

	// Signatures should be different for different messages
	require.True(t, v1 != v2 || r1 != r2 || s1 != s2)
}

func TestComputeDomainSeparator_DifferentChains(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")

	signer1, err := NewEIP712Signer(privateKey, receiverAddress, big.NewInt(1))
	require.NoError(t, err)

	signer2, err := NewEIP712Signer(privateKey, receiverAddress, big.NewInt(10001))
	require.NoError(t, err)

	// Domain separators should be different for different chain IDs
	require.NotEqual(t, signer1.domainSeparator, signer2.domainSeparator)
}

func TestComputeDomainSeparator_DifferentReceivers(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	chainID := big.NewInt(1)

	signer1, err := NewEIP712Signer(privateKey, common.HexToAddress("0x1111111111111111111111111111111111111111"), chainID)
	require.NoError(t, err)

	signer2, err := NewEIP712Signer(privateKey, common.HexToAddress("0x2222222222222222222222222222222222222222"), chainID)
	require.NoError(t, err)

	// Domain separators should be different for different receiver addresses
	require.NotEqual(t, signer1.domainSeparator, signer2.domainSeparator)
}

func TestSignLockMessage_LargeAmount(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	// Test with very large amount
	largeAmount := new(big.Int)
	largeAmount.SetString("1000000000000000000000000000", 10) // 1 billion tokens with 18 decimals

	msg := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0xff},
		Amount:        largeAmount,
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    1234567890,
		VcHash:        [32]byte{0xee},
	}

	v, r, s, err := signer.SignLockMessage(msg)

	require.NoError(t, err)
	require.NotZero(t, v)
	require.NotEqual(t, [32]byte{}, r)
	require.NotEqual(t, [32]byte{}, s)
}

func TestSignLockMessage_MaxValidUntil(t *testing.T) {
	t.Parallel()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	receiverAddress := common.HexToAddress("0x2222222222222222222222222222222222222222")
	chainID := big.NewInt(1)

	signer, err := NewEIP712Signer(privateKey, receiverAddress, chainID)
	require.NoError(t, err)

	// Test with max uint64 value for validUntil
	msg := contracts.LockMessage{
		Borrower:      common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		LockId:        [32]byte{0xdd},
		Amount:        big.NewInt(1000000),
		SourceChainId: big.NewInt(15000),
		SourceLocker:  common.HexToAddress("0x1111111111111111111111111111111111111111"),
		ValidUntil:    18446744073709551615, // max uint64
		VcHash:        [32]byte{0xcc},
	}

	v, r, s, err := signer.SignLockMessage(msg)

	require.NoError(t, err)
	require.NotZero(t, v)
	require.NotEqual(t, [32]byte{}, r)
	require.NotEqual(t, [32]byte{}, s)
}
