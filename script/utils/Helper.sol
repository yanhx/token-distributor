// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import { console } from "forge-std/Script.sol";

library Helper {
    function logDeployment(string memory network, address proxy) internal pure {
        console.log("Deployed on:", network, proxy);
    }
}
