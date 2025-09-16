// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function decimals() external view returns (uint8);
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
        address addr,
        address[] memory tokens
    )
        external
        view
        returns (uint256[] memory balances, uint256[] memory decimals)
    {
        uint256 len = tokens.length;
        balances = new uint256[](len);
        decimals = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            address t = tokens[i];
            balances[i] = _getBalance(t, addr);
            decimals[i] = _getDecimalsOrDefault(t, 18); // Default to 18 on failure
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

    function _getDecimalsOrDefault(address token, uint8 fallbackDecimals)
        internal
        view
        returns (uint256 dec)
    {
        (bool ok, bytes memory data) =
            token.staticcall(abi.encodeWithSelector(IERC20.decimals.selector));
        if (ok && data.length >= 32) {
            dec = uint256(uint8(bytes1(data[31]))); // Handle cases where uint8 is returned
            // The above line safely extracts only uint8.
            // Most cases are sufficient with abi.decode(data, (uint8)):
            // dec = abi.decode(data, (uint8));
        } else {
            dec = fallbackDecimals;
        }
    }
}
