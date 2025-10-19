#!/usr/bin/env ts-node

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

export interface UserData {
    address: string; // user address
    amount: string; // token amount (wei format)
}

export interface UserDataFromFile {
    address: string; // user address
    amount: string; // token amount (in ETH format, will be converted to wei)
}

export class MerkleProofGenerator {
    private users: UserData[];
    private leaves: string[];
    private root: string;
    private proofs: Map<string, string[]>;

    constructor(users: UserData[]) {
        this.users = users;
        this.leaves = this.generateLeaves();
        this.proofs = new Map();
        this.root = this.buildTreeAndGenerateProofs();
    }

    private generateLeaves(): string[] {
        return this.users.map((user) => {
            const encoded = ethers.solidityPacked(["address", "uint256"], [user.address, user.amount]);
            return ethers.keccak256(encoded);
        });
    }

    private hashPair(a: string, b: string): string {
        const hashA = a.toLowerCase();
        const hashB = b.toLowerCase();

        if (hashA < hashB) {
            return ethers.keccak256(ethers.concat([a, b]));
        } else {
            return ethers.keccak256(ethers.concat([b, a]));
        }
    }

    private buildTreeAndGenerateProofs(): string {
        const paddedLeaves = [...this.leaves];
        const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(paddedLeaves.length)));
        while (paddedLeaves.length < nextPowerOfTwo) {
            paddedLeaves.push(ethers.ZeroHash);
        }

        // tree structure
        let currentLevel = paddedLeaves;
        const tree: string[][] = [currentLevel];

        while (currentLevel.length > 1) {
            const nextLevel: string[] = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = currentLevel[i + 1];
                nextLevel.push(this.hashPair(left, right));
            }
            tree.push(nextLevel);
            currentLevel = nextLevel;
        }

        // generate proof for each user
        this.users.forEach((user, userIndex) => {
            const proof = this.generateProofForIndex(userIndex, tree);
            const key = this.getUserKey(user.address, user.amount);
            this.proofs.set(key, proof);
        });

        return currentLevel[0];
    }

    private generateProofForIndex(leafIndex: number, tree: string[][]): string[] {
        const proof: string[] = [];
        let currentIndex = leafIndex;

        for (let level = 0; level < tree.length - 1; level++) {
            const currentLevel = tree[level];
            const isLeftChild = currentIndex % 2 === 0;
            const siblingIndex = isLeftChild ? currentIndex + 1 : currentIndex - 1;

            if (siblingIndex < currentLevel.length) {
                proof.push(currentLevel[siblingIndex]);
            }

            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    private getUserKey(address: string, amount: string): string {
        return `${address.toLowerCase()}_${amount}`;
    }

    public getRoot(): string {
        return this.root;
    }

    public getProof(address: string, amount: string): string[] {
        const key = this.getUserKey(address, amount);
        const proof = this.proofs.get(key);
        if (!proof) {
            throw new Error(`user proof not found: ${address} (${amount})`);
        }
        return proof;
    }

    public getAllProofs(): Array<{
        address: string;
        amount: string;
        proof: string[];
        valid: boolean;
    }> {
        return this.users.map((user) => {
            const proof = this.getProof(user.address, user.amount);
            const leaf = ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [user.address, user.amount]));
            const valid = MerkleProofGenerator.verifyProof(proof, this.root, leaf);

            return {
                address: user.address,
                amount: user.amount,
                proof,
                valid,
            };
        });
    }

    public static verifyProof(proof: string[], root: string, leaf: string): boolean {
        let computedHash = leaf;

        for (const proofElement of proof) {
            const hashA = computedHash.toLowerCase();
            const hashB = proofElement.toLowerCase();

            if (hashA < hashB) {
                computedHash = ethers.keccak256(ethers.concat([computedHash, proofElement]));
            } else {
                computedHash = ethers.keccak256(ethers.concat([proofElement, computedHash]));
            }
        }

        return computedHash.toLowerCase() === root.toLowerCase();
    }

    public exportAsJson(): string {
        const allProofs = this.getAllProofs();

        const exportData = {
            merkleRoot: this.root,
            totalUsers: this.users.length,
            users: allProofs.map((p) => ({
                address: p.address,
                amount: p.amount,
                amountFormatted: ethers.formatEther(p.amount) + " tokens",
                proof: p.proof,
                valid: p.valid,
            })),
        };

        return JSON.stringify(exportData, null, 2);
    }

    public exportAsSolidity(): string {
        const allProofs = this.getAllProofs();

        let output = `// generated merkle tree constants\\n`;
        output += `bytes32 constant MERKLE_ROOT = ${this.root};\\n\\n`;

        allProofs.forEach((p, index) => {
            output += `// user ${index + 1}: ${p.address} (${ethers.formatEther(p.amount)} tokens)\\n`;
            output += `bytes32[] memory USER_${index + 1}_PROOF = new bytes32[](${p.proof.length});\\n`;
            p.proof.forEach((proof, i) => {
                output += `USER_${index + 1}_PROOF[${i}] = ${proof};\\n`;
            });
            output += `\\n`;
        });

        return output;
    }

    public exportAsCSV(): string {
        const allProofs = this.getAllProofs();

        let csv = "Address,Amount (ETH),Amount (Wei),Proof\\n";

        allProofs.forEach((p) => {
            const amountInEth = ethers.formatEther(p.amount);
            const proofString = p.proof.map((proof) => `"${proof}"`).join(";");
            csv += `${p.address},${amountInEth},${p.amount},"[${proofString}]"\\n`;
        });

        return csv;
    }

    public static loadUsersFromFile(filePath: string): UserData[] {
        try {
            const data = fs.readFileSync(filePath, "utf8");
            const usersFromFile: UserDataFromFile[] = JSON.parse(data);

            return usersFromFile.map((user) => ({
                address: user.address,
                amount: ethers.parseEther(user.amount).toString(),
            }));
        } catch (error) {
            throw new Error(`Failed to load users from file ${filePath}: ${error}`);
        }
    }

    public static saveToFile(content: string, filePath: string): void {
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, "utf8");
            console.log(`✅ File saved: ${filePath}`);
        } catch (error) {
            throw new Error(`Failed to save file ${filePath}: ${error}`);
        }
    }
}

/**

- Generate proof from JSON file and export to CSV
*/
export function generateProofFromFile(
    inputFile: string,
    outputFile?: string,
): {
    root: string;
    users: Array<{ address: string; amount: string; proof: string[] }>;
    csvPath: string;
} {
    console.log(`📁 Loading users from: ${inputFile}`);
    const users = MerkleProofGenerator.loadUsersFromFile(inputFile);
    console.log(`👥 Loaded ${users.length} users`);

    const generator = new MerkleProofGenerator(users);
    const root = generator.getRoot();
    const allProofs = generator.getAllProofs();

    console.log(`🌳 Merkle Root: ${root}`);

    // Generate CSV content
    const csvContent = generator.exportAsCSV();

    // Determine output file path
    const csvPath = outputFile || path.join(path.dirname(inputFile), "merkle_proofs.csv");

    // Save CSV file
    MerkleProofGenerator.saveToFile(csvContent, csvPath);

    // Also save JSON with all data
    const jsonPath = path.join(path.dirname(inputFile), "merkle_data.json");
    const jsonContent = generator.exportAsJson();
    MerkleProofGenerator.saveToFile(jsonContent, jsonPath);

    return {
        root,
        users: allProofs.map((p) => ({
            address: p.address,
            amount: p.amount,
            proof: p.proof,
        })),
        csvPath,
    };
}

/**

- generate proof for three users (match solidity test)
*/
export function generateThreeUsersProof(): {
    root: string;
    users: Array<{ address: string; amount: string; proof: string[] }>;
} {
    const users: UserData[] = [
        {
            address: "0xCC494989D8b3415DBdf86fa36B48d4732aFB4b8E",
            amount: ethers.parseEther("0.000007").toString(),
        }, // Alice: 1000 tokens
        {
            address: "0x77002f7B26331210B3108C16270dd11dE0a20c5A",
            amount: ethers.parseEther("0.000002").toString(),
        }, // Bob: 2500 tokens
        {
            address: "0xa1A28d324654F574A3012083080B369bdbd3f76E",
            amount: ethers.parseEther("0.0000002").toString(),
        }, // Bob: 2500 tokens
    ];

    const generator = new MerkleProofGenerator(users);
    const root = generator.getRoot();
    const allProofs = generator.getAllProofs();

    return {
        root,
        users: allProofs.map((p) => ({
            address: p.address,
            amount: p.amount,
            proof: p.proof,
        })),
    };
}

if (require.main === module) {
    console.log("🌳 Merkle proof generator");
    console.log("=".repeat(50));

    // Check if user wants to generate from file
    const args = process.argv.slice(2);
    if (args.length > 0 && args[0] === "--file") {
        const inputFile = args[1] || "./data/users.json";
        const outputFile = args[2];

        console.log("\\n📁 Generating proof from file");
        console.log("-".repeat(40));

        try {
            const result = generateProofFromFile(inputFile, outputFile);
            console.log(`\\n✅ Successfully generated proofs for ${result.users.length} users`);
            console.log(`📄 CSV file saved to: ${result.csvPath}`);
            console.log(`🌳 Merkle Root: ${result.root}`);
        } catch (error) {
            console.error(`❌ Error: ${error}`);
            process.exit(1);
        }
    } else {
        console.log("\n📋 example: three users proof generation");
        console.log("-".repeat(40));

        const result = generateThreeUsersProof();

        console.log(`Merkle Root: ${result.root}`);
        console.log(`expected root:   0x157c2504d25de7180fb90bf2851d46113b7f340691c03bb35ce50265d9fbca76`);
        console.log(
            `match: ${
                result.root === "0x157c2504d25de7180fb90bf2851d46113b7f340691c03bb35ce50265d9fbca76"
                    ? "✅ yes"
                    : "❌ no"
            }`,
        );

        console.log("\\nuser proof:");
        const userNames = ["Alice", "Bob", "Charlie"];
        result.users.forEach((user, index) => {
            console.log(`${userNames[index]}: ${user.address}`);
            console.log(`  amount: ${ethers.formatEther(user.amount)} tokens`);
            console.log(`  proof: [${user.proof.map((p) => `"${p}"`).join(", ")}]`);
            console.log("");
        });

        console.log("\\n📋 example: custom users proof generation");
        console.log("-".repeat(40));

        const customUsers: UserData[] = [
            {
                address: "0x1111111111111111111111111111111111111111",
                amount: "1000000000000000000000",
            },
            {
                address: "0x2222222222222222222222222222222222222222",
                amount: "2000000000000000000000",
            },
            {
                address: "0x3333333333333333333333333333333333333333",
                amount: "1500000000000000000000",
            },
        ];

        const customGenerator = new MerkleProofGenerator(customUsers);
        console.log(`custom root: ${customGenerator.getRoot()}`);

        const customProofs = customGenerator.getAllProofs();
        console.log(`total users: ${customProofs.length}`);
        console.log(`all proofs valid: ${customProofs.every((p) => p.valid) ? "✅ yes" : "❌ no"}`);
    }

    console.log("\n🎉 Usage:");
    console.log("  # Generate from file:");
    console.log("  ts-node merkle-proof.ts --file [input.json] [output.csv]");
    console.log("  # Example:");
    console.log("  ts-node merkle-proof.ts --file ./data/users.json ./output/merkle_proofs.csv");
    console.log("");
    console.log("  # Generate hardcoded examples:");
    console.log("  ts-node merkle-proof.ts");
    console.log("");
    console.log("  # Programmatic usage:");
    console.log('  import { MerkleProofGenerator, generateProofFromFile } from "./merkle-proof";');
    console.log("  const generator = new MerkleProofGenerator(users);");
    console.log("  const proof = generator.getProof(address, amount);");
    console.log("  const result = generateProofFromFile('./data/users.json');");
}
