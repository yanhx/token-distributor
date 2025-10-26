// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "./utils/Helper.sol";
import "../src/BatchTransfer.sol";

contract DeployScript is Script {
    function run(string memory network) external {
        // network: eth, polygon, bsc...
        _deployOnNetwork(network);
    }

    function _deployOnNetwork(string memory network) internal {
        // 1. add deploy key
        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerKey);
        console.log("deployer:", deployer);

        // 2. execute deploy
        vm.startBroadcast(deployerKey);
        address batchTransferAddress = address(new BatchTransfer());
        vm.stopBroadcast();

        // 3. log deployment
        Helper.logDeployment(network, batchTransferAddress);
    }
}
