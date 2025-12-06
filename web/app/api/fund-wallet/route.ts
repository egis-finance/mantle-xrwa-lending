import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from 'dotenv';
import { resolve } from 'path';

const execAsync = promisify(exec);

// Load environment variables from parent directory's .env file
const parentEnvPath = resolve(process.cwd(), '../.env');
config({ path: parentEnvPath });

export async function POST(request: NextRequest) {
    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json(
            { error: 'Funding is only available in development mode' },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { address } = body;

        // Validate address format
        if (!address || typeof address !== 'string' || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
            return NextResponse.json(
                { error: 'Invalid wallet address' },
                { status: 400 }
            );
        }

        console.log(`[Fund Wallet] Funding wallet: ${address}`);

        // Execute the Forge script
        const scriptPath = 'script/FundSingleWallet.s.sol:FundSingleWallet';
        const rpcUrl = process.env.MANTLE_RPC_VTE;

        if (!rpcUrl) {
            return NextResponse.json(
                { error: 'MANTLE_RPC_VTE not configured. Please check your .env file.' },
                { status: 500 }
            );
        }

        // Use full path to forge to ensure it's found in the API route environment
        const forgePath = process.env.FORGE_PATH || `${process.env.HOME}/.foundry/bin/forge`;
        const command = `cd .. && ${forgePath} script ${scriptPath} --rpc-url "${rpcUrl}" --broadcast --legacy --skip-simulation --sig "run(address)" ${address}`;

        console.log(`[Fund Wallet] Executing: ${command}`);

        const { stdout, stderr } = await execAsync(command, {
            env: { ...process.env },
            timeout: 30000, // 30 second timeout
        });

        console.log(`[Fund Wallet] stdout:`, stdout);
        if (stderr) {
            console.error(`[Fund Wallet] stderr:`, stderr);
        }

        // Check if the transaction was successful
        if (stdout.includes('Funding Complete') || stdout.includes('ONCHAIN EXECUTION COMPLETE')) {
            return NextResponse.json({
                success: true,
                message: 'Wallet funded successfully',
                address,
            });
        } else {
            throw new Error('Funding script did not complete successfully');
        }
    } catch (error: unknown) {
        console.error('[Fund Wallet] Error:', error);
        const execError = error as { message?: string; stderr?: string; stdout?: string; cmd?: string };
        return NextResponse.json(
            {
                error: 'Failed to fund wallet',
                details: execError.message || 'Unknown error',
                stderr: execError.stderr || '',
                stdout: execError.stdout || '',
                command: execError.cmd || '',
            },
            { status: 500 }
        );
    }
}
