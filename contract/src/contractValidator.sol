// SPDX-License-Identifier: UNLICENSED
interface IERC20{
    function balanceOf(address) external view returns(uint256);
}
pragma solidity ^0.8.13;

contract contractValidator {
    constructor(){}

    function getCodeHashes(address[] memory addrs) external view returns(bytes32[] memory results){
        results = new bytes32[](addrs.length);
        for(uint256 i=0; i<results.length; i++){
            if( addrs[i].code.length == 0) continue;
            results[i] = keccak256(addrs[i].code);
        }
    }

    function isContract(address[] memory addrs) external view returns(bool[] memory results){
        results = new bool[](addrs.length);
        for(uint256 i=0; i<addrs.length; i++){
            if ((addrs[i].code).length != 0) results[i] = true;
        }
    }
}
