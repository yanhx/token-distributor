#!/usr/bin/env ts-node

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

interface UserData {
    address: string;
    amount: string;
}

interface Config {
    rpcUrl: string;
    privateKey: string;
}

interface NetworkConfig {
    rpcUrl: string;
}

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const networks: Record<string, NetworkConfig> = {
    eth: {
        rpcUrl: "https://eth.llamarpc.com",
    },
    plasma: {
        rpcUrl: "https://rpc.plasma.to",
    },
    localhost: {
        rpcUrl: "http://localhost:8545",
    },
    sepolia: {
        rpcUrl: `https://eth-sepolia.g.alchemy.com/v2/${process.env.API_KEY_ALCHEMY}`,
    },
};

function createConfig(network: string): Config {
    const privateKey = process.env.DEPLOYER_PK;
    if (!privateKey) {
        throw new Error("DEPLOYER_PK not found in environment variables");
    }

    const networkConfig = networks[network];
    if (!networkConfig) {
        throw new Error(`Network ${network} not supported`);
    }

    return {
        rpcUrl: networkConfig.rpcUrl,
        privateKey,
    };
}

/**
 * Read users from JSON file
 */
function readUsersFromFile(filePath: string): UserData[] {
    try {
        const data = fs.readFileSync(filePath, "utf8");
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Failed to read users file: ${error}`);
    }
}

/**
 * Check if gas estimate is within safe limits
 */
function checkGasLimit(gasEstimate: bigint, gasLimit: bigint = BigInt(2_000_000)): boolean {
    console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
    console.log(`📊 Gas limit: ${gasLimit.toString()}`);

    if (gasEstimate > gasLimit) {
        console.error(`❌ Gas estimate ${gasEstimate} exceeds limit ${gasLimit}`);
        console.error(`⚠️  Transaction will be cancelled for safety`);
        return false;
    }

    console.log(`✅ Gas estimate ${gasEstimate} is within safe limit ${gasLimit}`);
    return true;
}

/**
 * Batch transfer tokens to users using BatchTransfer contract
 * Supports both ERC20 tokens and native ETH
 */
async function batchTransferToUsers(
    config: Config,
    batchTransferAddress: string,
    tokenAddress: string,
    users: UserData[],
) {
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // Determine if this is an ETH transfer or ERC20 token transfer
    const isETH = tokenAddress.toLowerCase() === ETH_ADDRESS.toLowerCase();

    console.log("📝 Preparing batch transfer...");
    console.log(`📋 Total users: ${users.length}`);
    console.log(`🪙 Token type: ${isETH ? "Native ETH" : "ERC20"}`);

    // Parse amounts and addresses
    const recipients: string[] = [];
    const amounts: bigint[] = [];
    let totalAmount = BigInt(0);

    for (const user of users) {
        recipients.push(user.address);
        const amountWei = ethers.parseEther(user.amount);
        amounts.push(amountWei);
        totalAmount += amountWei;
    }

    console.log(`💰 Total amount: ${ethers.formatEther(totalAmount)} ${isETH ? "ETH" : "tokens"}`);

    // Convert amounts to string array for ABI encoding
    const amountsStr = amounts.map((amt) => amt.toString());

    let tx: ethers.ContractTransactionResponse;
    let gasEstimate: bigint;

    if (isETH) {
        // Use batchTransferETH for native ETH
        console.log("🔷 Using native ETH transfer");
        const batchTransfer = new ethers.Contract(
            batchTransferAddress,
            ["function batchTransferETH(address[] memory _to, uint[] memory _values) external payable"],
            wallet,
        );

        // Estimate gas for ETH transfer
        console.log("⛽ Estimating gas for ETH transfer...");
        gasEstimate = await batchTransfer.batchTransferETH.estimateGas(recipients, amountsStr);

        // Check gas limit before executing
        if (!checkGasLimit(gasEstimate)) {
            throw new Error("Transaction cancelled due to excessive gas estimate");
        }

        // Execute batch ETH transfer
        console.log("🚀 Executing batch ETH transfer...");
        tx = await batchTransfer.batchTransferETH(recipients, amountsStr, { gasLimit: gasEstimate });
    } else {
        // Use batchTransferToken for ERC20 tokens
        console.log("🔷 Using ERC20 token transfer");
        const batchTransfer = new ethers.Contract(
            batchTransferAddress,
            [
                "function batchTransferToken(address _tokenAddress, address[] memory _to, uint[] memory _values) external",
            ],
            wallet,
        );

        // Estimate gas for token transfer
        console.log("⛽ Estimating gas for token transfer...");
        gasEstimate = await batchTransfer.batchTransferToken.estimateGas(tokenAddress, recipients, amountsStr);

        // Check gas limit before executing
        if (!checkGasLimit(gasEstimate)) {
            throw new Error("Transaction cancelled due to excessive gas estimate");
        }

        // Execute batch token transfer
        console.log("🚀 Executing batch token transfer...");
        tx = await batchTransfer.batchTransferToken(tokenAddress, recipients, amountsStr, { gasLimit: gasEstimate });
    }

    console.log(`📡 Transaction hash: ${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt?.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt?.gasUsed.toString()}`);

    return {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString(),
        totalAmount: ethers.formatEther(totalAmount),
        userCount: users.length,
        tokenType: isETH ? "ETH" : "ERC20",
    };
}

/**
 * Main execution
 */
async function main() {
    console.log("🌳 Batch Transfer Script");
    console.log("=".repeat(50));

    // Parse command line arguments
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error(
            "Usage: ts-node batch-transfer.ts <network> <batch-transfer-address> <token-address> [users-file]",
        );
        console.error("Networks: eth, plasma, localhost");
        console.error("\nExample:");
        console.error("  ts-node batch-transfer.ts plasma 0x1234... 0xabcd...");
        console.error("  ts-node batch-transfer.ts eth 0x1234... 0xabcd... ./data/custom_users.json");
        process.exit(1);
    }

    const [network, batchTransferAddress, tokenAddress, usersFile] = args;

    // Create config from network
    const config = createConfig(network);
    console.log("🌐 Network:", network);
    console.log("📡 RPC URL:", config.rpcUrl);
    console.log("👛 Wallet:", new ethers.Wallet(config.privateKey).address);

    // Default to ./typescipts/data/users.json if not provided
    const usersFilePath = usersFile || path.join(__dirname, "data/users.json");

    console.log("📁 Loading users from:", usersFilePath);
    const users = readUsersFromFile(usersFilePath);
    console.log(`👥 Loaded ${users.length} users`);

    console.log("\n📋 Users to transfer:");
    users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.address}: ${user.amount} tokens`);
    });

    // Execute batch transfer
    const result = await batchTransferToUsers(config, batchTransferAddress, tokenAddress, users);

    console.log("\n✅ Batch transfer completed successfully!");
    console.log("=".repeat(50));
    console.log(`📊 Summary:`);
    console.log(`   Token type: ${result.tokenType}`);
    console.log(`   Total users: ${result.userCount}`);
    console.log(`   Total amount: ${result.totalAmount} ${result.tokenType}`);
    console.log(`   Gas used: ${result.gasUsed}`);
    console.log(`   Block number: ${result.blockNumber}`);
    console.log(`   Transaction hash: ${result.txHash}`);
}

// Execute if run directly
if (require.main === module) {
    main().catch((error) => {
        console.error("❌ Error:", error);
        process.exit(1);
    });
}

export { batchTransferToUsers, readUsersFromFile, createConfig, checkGasLimit };
