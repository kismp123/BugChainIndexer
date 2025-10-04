// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

contract BalanceHelper {
    constructor() {}

    function getNativeBalance(address[] memory addrs) external view returns(uint256[] memory balances){
        balances = new uint256[](addrs.length);
        for(uint256 i=0; i<addrs.length; i++){
            balances[i] = addrs[i].balance;
        }
    }

    function getTokenBalance(
        address[] memory addrs,
        address[] memory tokens
    )
        external
        view
        returns (uint256[] memory balances)
    {
        uint256 addrLen = addrs.length;
        uint256 tokenLen = tokens.length;
        balances = new uint256[](addrLen * tokenLen);

        for (uint256 i = 0; i < addrLen; i++) {
            for (uint256 j = 0; j < tokenLen; j++) {
                balances[i * tokenLen + j] = _getBalance(tokens[j], addrs[i]);
            }
        }
    }

    function _getBalance(address token, address user) internal view returns (uint256 balance) {
        if (token == address(0)) {
            return user.balance;
        }
        (bool ok, bytes memory data) =
            token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, user));
        if (ok && data.length >= 32) {
            balance = abi.decode(data, (uint256));
        } else {
            balance = 0; // Return 0 on failure
        }
    }

}
