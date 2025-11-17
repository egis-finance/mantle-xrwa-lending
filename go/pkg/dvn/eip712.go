package dvn

import (
	"crypto/ecdsa"
	"encoding/binary"
	"fmt"
	"math/big"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// EIP712Signer handles EIP-712 signature generation for LockMessage
type EIP712Signer struct {
	privateKey      *ecdsa.PrivateKey
	receiverAddress common.Address
	chainID         *big.Int
	domainSeparator [32]byte
}

// NewEIP712Signer creates a new signer for a specific chain and receiver contract
func NewEIP712Signer(privateKeyHex string, receiverAddress common.Address, chainID *big.Int) (*EIP712Signer, error) {
	// Remove 0x prefix if present
	if len(privateKeyHex) > 2 && privateKeyHex[:2] == "0x" {
		privateKeyHex = privateKeyHex[2:]
	}

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	signer := &EIP712Signer{
		privateKey:      privateKey,
		receiverAddress: receiverAddress,
		chainID:         chainID,
	}

	// Compute domain separator once
	signer.domainSeparator = signer.computeDomainSeparator()

	return signer, nil
}

// computeDomainSeparator calculates the EIP-712 domain separator
// keccak256(abi.encode(
//     keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
//     keccak256("XRWAReceiver"),
//     keccak256("1"),
//     chainId,
//     address(this)
// ))
func (s *EIP712Signer) computeDomainSeparator() [32]byte {
	domainTypeHash := crypto.Keccak256Hash([]byte("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"))
	nameHash := crypto.Keccak256Hash([]byte("XRWAReceiver"))
	versionHash := crypto.Keccak256Hash([]byte("1"))

	// Pack domain separator components
	data := make([]byte, 0, 160)
	data = append(data, domainTypeHash.Bytes()...)
	data = append(data, nameHash.Bytes()...)
	data = append(data, versionHash.Bytes()...)
	data = append(data, common.LeftPadBytes(s.chainID.Bytes(), 32)...)
	data = append(data, common.LeftPadBytes(s.receiverAddress.Bytes(), 32)...)

	return crypto.Keccak256Hash(data)
}

// SignLockMessage generates an EIP-712 signature for a LockMessage
// Returns v, r, s components
func (signer *EIP712Signer) SignLockMessage(msg contracts.LockMessage) (v uint8, r, s [32]byte, err error) {
	// Compute struct hash
	// keccak256(abi.encode(
	//     keccak256("LockMessage(address borrower,bytes32 lockId,uint256 amount,uint256 sourceChainId,address sourceLocker,uint64 validUntil,bytes32 vcHash)"),
	//     borrower,
	//     lockId,
	//     amount,
	//     sourceChainId,
	//     sourceLocker,
	//     validUntil,
	//     vcHash
	// ))
	structHash := signer.computeStructHash(msg)

	// Compute digest: keccak256("\x19\x01" || domainSeparator || structHash)
	digest := make([]byte, 0, 66)
	digest = append(digest, []byte("\x19\x01")...)
	digest = append(digest, signer.domainSeparator[:]...)
	digest = append(digest, structHash[:]...)
	digestHash := crypto.Keccak256Hash(digest)

	// Sign the digest
	signature, err := crypto.Sign(digestHash.Bytes(), signer.privateKey)
	if err != nil {
		return 0, [32]byte{}, [32]byte{}, fmt.Errorf("failed to sign: %w", err)
	}

	// Extract v, r, s from signature
	// signature is 65 bytes: [R || S || V]
	copy(r[:], signature[0:32])
	copy(s[:], signature[32:64])
	v = signature[64] + 27 // Ethereum uses 27/28 for v

	return v, r, s, nil
}

// computeStructHash calculates the struct hash for LockMessage
func (s *EIP712Signer) computeStructHash(msg contracts.LockMessage) [32]byte {
	typeHash := crypto.Keccak256Hash([]byte("LockMessage(address borrower,bytes32 lockId,uint256 amount,uint256 sourceChainId,address sourceLocker,uint64 validUntil,bytes32 vcHash)"))

	data := make([]byte, 0, 256)
	data = append(data, typeHash.Bytes()...)
	data = append(data, common.LeftPadBytes(msg.Borrower.Bytes(), 32)...)
	data = append(data, msg.LockId[:]...)
	data = append(data, common.LeftPadBytes(msg.Amount.Bytes(), 32)...)
	data = append(data, common.LeftPadBytes(msg.SourceChainId.Bytes(), 32)...)
	data = append(data, common.LeftPadBytes(msg.SourceLocker.Bytes(), 32)...)

	// validUntil is uint64, needs to be padded to 32 bytes
	validUntilBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(validUntilBytes, msg.ValidUntil)
	data = append(data, common.LeftPadBytes(validUntilBytes, 32)...)

	data = append(data, msg.VcHash[:]...)

	return crypto.Keccak256Hash(data)
}

// GetSignerAddress returns the Ethereum address of the signer
func (s *EIP712Signer) GetSignerAddress() common.Address {
	publicKey := s.privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return common.Address{}
	}
	return crypto.PubkeyToAddress(*publicKeyECDSA)
}
