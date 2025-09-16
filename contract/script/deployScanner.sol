// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/contractValidator.sol";

contract DeployScript is Script {
    function run() external {
        // Load private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Set transaction sender with the key
        vm.startBroadcast(deployerPrivateKey);

        // Actual deployment
        contractValidator deployed = new contractValidator();

        vm.stopBroadcast();

        console.log("Contract deployed at:", address(deployed));
    }
}