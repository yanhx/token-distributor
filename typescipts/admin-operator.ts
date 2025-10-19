import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

interface Config {
    rpcUrl: string;
    privateKey: string;
}

interface NetworkConfig {
    rpcUrl: string;
}

class DistributorAdmin {
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;

    constructor(config: Config) {
        this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.wallet = new ethers.Wallet(config.privateKey, this.provider);

        console.log("wallet address", this.wallet.address);
    }

    async createDistributor(token: string, operator: string, amount: string) {
        // Note: This method assumes the TokenDistributor contract is already deployed
        // In a real scenario, you would need the contract bytecode to deploy it
        // For now, we'll return a mock address and suggest using the deployment script

        console.log("Note: To deploy TokenDistributor, use the Foundry deployment script:");
        console.log(
            "forge script script/DeployDistributor.sol --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --broadcast",
        );
        console.log("Then use the deployed address in subsequent operations.");

        // Return a placeholder - replace with actual deployed address
        const mockAddress = "0x0000000000000000000000000000000000000000";

        return {
            address: mockAddress,
            receipt: null,
        };
    }

    async fundDistributor(distributorAddress: string, amount: string) {
        // Send ETH to the distributor contract for native token distribution
        const tx = await this.wallet.sendTransaction({
            to: distributorAddress,
            value: ethers.parseEther(amount),
        });
        const receipt = await tx.wait();

        if (receipt) {
            console.log(`Funded distributor with ${amount} ETH:`, receipt.hash);
        }
        return receipt;
    }

    async setMerkleRoot(distributorAddress: string, merkleRoot: string) {
        const distributorABI = ["function setMerkleRoot(bytes32 _merkleRoot) external"];

        const distributor = new ethers.Contract(distributorAddress, distributorABI, this.wallet);
        const tx = await distributor.setMerkleRoot(merkleRoot);
        await tx.wait();

        console.log("Merkle root set:", merkleRoot);
    }

    async setStartTime(distributorAddress: string, startTime: number) {
        const distributorABI = ["function setTime(uint256 _startTime) external"];

        const distributor = new ethers.Contract(distributorAddress, distributorABI, this.wallet);
        const tx = await distributor.setTime(startTime);
        await tx.wait();

        console.log("Start time set:", new Date(startTime * 1000));
    }

    async claim(distributorAddress: string, user: string, amount: string, proof: string[]) {
        const distributorABI = ["function claim(uint256 maxAmount, bytes32[] calldata proof) external"];

        const distributor = new ethers.Contract(distributorAddress, distributorABI, this.wallet);
        const tx = await distributor.claim(ethers.parseEther(amount), proof);
        const receipt = await tx.wait();

        console.log("Claim:", receipt);
        return receipt;
    }

    async getClaimedAmount(distributorAddress: string, user: string) {
        const distributorABI = ["function claimedAmounts(address) external view returns (uint256)"];

        const distributor = new ethers.Contract(distributorAddress, distributorABI, this.provider);
        const amount = await distributor.claimedAmounts(user);
        return ethers.formatEther(amount);
    }

    async getDistributorInfo(distributorAddress: string) {
        const distributorABI = [
            "function token() external view returns (address)",
            "function operator() external view returns (address)",
            "function owner() external view returns (address)",
            "function merkleRoot() external view returns (bytes32)",
            "function startTime() external view returns (uint64)",
            "function endTime() external view returns (uint64)",
            "function totalClaimed() external view returns (uint256)",
            "function getBalance() external view returns (uint256)",
        ];

        const distributor = new ethers.Contract(distributorAddress, distributorABI, this.provider);

        const [token, operator, owner, merkleRoot, startTime, endTime, totalClaimed, balance] = await Promise.all([
            distributor.token(),
            distributor.operator(),
            distributor.owner(),
            distributor.merkleRoot(),
            distributor.startTime(),
            distributor.endTime(),
            distributor.totalClaimed(),
            distributor.getBalance(),
        ]);

        return {
            token,
            operator,
            owner,
            merkleRoot,
            startTime: Number(startTime),
            endTime: Number(endTime),
            totalClaimed: ethers.formatEther(totalClaimed),
            balance: ethers.formatEther(balance),
        };
    }
}

const networks: Record<string, NetworkConfig> = {
    eth: {
        rpcUrl: "[https://eth.llamarpc.com](https://eth.llamarpc.com/)",
    },
    plasma: {
        rpcUrl: "[https://rpc.plasma.to](https://rpc.plasma.to/)",
    },
};

function createConfig(network: string): Config {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY not found in environment variables");
    }

    const networkConfig = networks[network];
    if (!networkConfig) {
        throw new Error(`Network ${network} not supported`);
    }
    console.log("networkConfig", networkConfig);
    return {
        rpcUrl: networkConfig.rpcUrl,
        privateKey,
    };
}

async function main() {
    const network = "plasma";
    const config = createConfig(network);

    const admin = new DistributorAdmin(config);

    // 1. create distributor (use deployment script first)
    // 1.1 create native distributor
    const nativeDistributorResult = await admin.createDistributor(
        ETH_ADDRESS,
        "0xCC494989D8b3415DBdf86fa36B48d4732aFB4b8E", // operator address
        "0.00001", // 0.00001 ETH
    );

    // Replace with actual deployed address from deployment script
    const nativeDistributor = "0xa1A28d324654F574A3012083080B369bdbd3f76E"; // Replace with actual address

    // Fund the distributor with ETH for native token distribution
    await admin.fundDistributor(nativeDistributor, "0.00001");

    // 1.2 create erc20 distributor
    //   const erc20Distributor = await admin.createDistributor(
    //     '0xTokenAddress123456789012345678901234567890', // token address
    //     '0x1234567890123456789012345678901234567890', // operator address
    //     '1000' // 1000 tokens
    //   );

    // 3. get distributor info
    const info = await admin.getDistributorInfo(nativeDistributor);
    console.log("Distributor info:", JSON.stringify(info, null, 2));

    // 4. set merkle root
    const root = "0xf370fb17ca69145587e585a231db220974bc97e8bfdb58404bcf9a9079977b05";
    await admin.setMerkleRoot(nativeDistributor, root);

    // 5.set start time
    const futureTime = Math.floor(Date.now() / 1000) + 180; // 1 hour later
    await admin.setStartTime(nativeDistributor, futureTime);

    // 6. claim
    const user = "";
    const amount = "0.000003";
    const proof = [""];
    const claim = await admin.claim(nativeDistributor, user, amount, proof);
    console.log("Claim:", claim);

    // 7. get distributor info
    const info2 = await admin.getClaimedAmount(nativeDistributor, user);
    console.log("Claimed amount:", info2);
}

if (require.main === module) {
    main().catch(console.error);
}

export { DistributorAdmin };
