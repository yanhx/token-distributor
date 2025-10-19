# Token Distributor

A Merkle tree-based token distribution contract built with Foundry and Solidity.

## 🌟 Features

- Merkle tree-based token distribution
- ERC20 & Native token support
- Time-based distribution periods
- Operator and owner role management
- Reentrancy protection

## 🚀 Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js

### Installation

```bash
git clone <repository-url>
cd token-distributor
forge install
npm install
forge build
```

## 📝 Usage

### 1. Generate Merkle Tree

```bash
cd typescipts
ts-node merkle-proof.ts --file ./data/users.json
```

### 2. Deploy Contract

```bash
forge script script/DeployDistributor.sol:DeployDistributorScript \
  --rpc-url <RPC_URL> \
  --private-key <PRIVATE_KEY> \
  --broadcast
```

### 3. Set Merkle Root (Operator)

```bash
cast send <CONTRACT_ADDRESS> \
  "setMerkleRoot(bytes32,uint64)" \
  <MERKLE_ROOT> <START_TIME> \
  --rpc-url <RPC_URL> \
  --private-key <OPERATOR_KEY>
```

### 4. Claim Tokens (Users)

```bash
cast send <CONTRACT_ADDRESS> \
  "claim(address,uint256,bytes32[])" \
  <USER_ADDRESS> <AMOUNT> <PROOF_ARRAY> \
  --rpc-url <RPC_URL> \
  --private-key <USER_KEY>
```

## 🧪 Testing

```bash
forge test                    # Run tests
forge test --gas-report       # With gas report
forge fmt                     # Format code
```

## 📁 Project Structure

```
src/                    # Solidity contracts
test/                   # Test files
script/                 # Deployment scripts
typescipts/            # TypeScript utilities
├── merkle-proof.ts    # Merkle tree generation
└── data/              # Data files (git ignored)
```

## 🔧 Configuration

Create `.env` file:

```env
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_private_key
OPERATOR_KEY=operator_private_key
OWNER_KEY=owner_private_key
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.
