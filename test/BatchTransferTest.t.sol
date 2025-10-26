// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BatchTransfer.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 token for testing
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10 ** 18); // Mint 1M tokens to deployer
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BatchTransferTest is Test {
    BatchTransfer public batchTransfer;
    MockERC20 public token;

    address public admin; // Will be set to deployer (address(this))
    address public operator = address(0x2);
    address public user1 = address(0x3);
    address public user2 = address(0x4);
    address public user3 = address(0x5);

    uint256 public constant TOKEN_AMOUNT = 1000 * 10 ** 18;

    event BatchTransferCompleted(address indexed operator, uint totalAmount);

    function setUp() public {
        // Deploy contracts as this contract (test contract is the admin)
        admin = address(this);
        batchTransfer = new BatchTransfer();
        token = new MockERC20("Test Token", "TEST");

        // Set up labels for better test output
        vm.label(admin, "Admin");
        vm.label(operator, "Operator");
        vm.label(user1, "User1");
        vm.label(user2, "User2");
        vm.label(user3, "User3");
    }

    // ============ ETH Batch Transfer Tests ============

    function testBatchTransferETH_Success() public {
        // Arrange: Setup operator role and fund contract
        batchTransfer.grantTransferRole(operator);

        vm.deal(address(batchTransfer), 10 ether);

        address[] memory recipients = new address[](3);
        recipients[0] = user1;
        recipients[1] = user2;
        recipients[2] = user3;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;

        uint256 user1BalanceBefore = user1.balance;
        uint256 user2BalanceBefore = user2.balance;
        uint256 user3BalanceBefore = user3.balance;

        // Act: Execute batch transfer
        vm.expectEmit(true, false, false, false);
        emit BatchTransferCompleted(operator, 6 ether);

        vm.prank(operator);
        batchTransfer.batchTransferETH(recipients, amounts);

        // Assert: Check balances
        assertEq(user1.balance, user1BalanceBefore + 1 ether, "User1 should receive 1 ETH");
        assertEq(user2.balance, user2BalanceBefore + 2 ether, "User2 should receive 2 ETH");
        assertEq(user3.balance, user3BalanceBefore + 3 ether, "User3 should receive 3 ETH");
        assertEq(address(batchTransfer).balance, 4 ether, "Contract should have 4 ETH remaining");
    }

    function testBatchTransferETH_RevertWhen_MismatchedInputs() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        vm.deal(address(batchTransfer), 10 ether);

        address[] memory recipients = new address[](2);
        recipients[0] = user1;
        recipients[1] = user2;

        uint256[] memory amounts = new uint256[](3); // Different length
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;

        // Act & Assert
        vm.prank(operator);
        vm.expectRevert("Mismatched transfer inputs");
        batchTransfer.batchTransferETH(recipients, amounts);
    }

    function testBatchTransferETH_RevertWhen_InsufficientBalance() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        vm.deal(address(batchTransfer), 5 ether); // Only 5 ether available

        address[] memory recipients = new address[](2);
        recipients[0] = user1;
        recipients[1] = user2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2 ether;
        amounts[1] = 4 ether; // Total 6 ether, but only 5 available

        // Act & Assert
        vm.prank(operator);
        vm.expectRevert("Sent ETH is less than the total required");
        batchTransfer.batchTransferETH(recipients, amounts);
    }

    function testBatchTransferETH_RevertWhen_NotAuthorized() public {
        // Arrange
        vm.deal(address(batchTransfer), 10 ether);

        address[] memory recipients = new address[](1);
        recipients[0] = user1;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        // Act & Assert: Call from operator who doesn't have TRANSFER_ROLE
        vm.prank(operator);
        vm.expectRevert();
        batchTransfer.batchTransferETH(recipients, amounts);
    }

    // ============ ERC20 Batch Transfer Tests ============

    function testBatchTransferToken_Success() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        // Fund batchTransfer contract with tokens
        token.mint(address(batchTransfer), TOKEN_AMOUNT);

        address[] memory recipients = new address[](3);
        recipients[0] = user1;
        recipients[1] = user2;
        recipients[2] = user3;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100 * 10 ** 18;
        amounts[1] = 200 * 10 ** 18;
        amounts[2] = 300 * 10 ** 18;

        // Act
        vm.expectEmit(true, false, false, false);
        emit BatchTransferCompleted(operator, 600 * 10 ** 18);

        vm.prank(operator);
        batchTransfer.batchTransferToken(address(token), recipients, amounts);

        // Assert
        assertEq(token.balanceOf(user1), 100 * 10 ** 18, "User1 should receive 100 tokens");
        assertEq(token.balanceOf(user2), 200 * 10 ** 18, "User2 should receive 200 tokens");
        assertEq(token.balanceOf(user3), 300 * 10 ** 18, "User3 should receive 300 tokens");
    }

    function testBatchTransferToken_RevertWhen_MismatchedInputs() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        address[] memory recipients = new address[](2);
        recipients[0] = user1;
        recipients[1] = user2;

        uint256[] memory amounts = new uint256[](1); // Different length
        amounts[0] = 100 * 10 ** 18;

        // Act & Assert
        vm.prank(operator);
        vm.expectRevert("Mismatched transfer inputs");
        batchTransfer.batchTransferToken(address(token), recipients, amounts);
    }

    function testBatchTransferToken_RevertWhen_NotAuthorized() public {
        // Arrange
        address[] memory recipients = new address[](1);
        recipients[0] = user1;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 * 10 ** 18;

        // Act & Assert
        vm.expectRevert();
        batchTransfer.batchTransferToken(address(token), recipients, amounts);
    }

    function testBatchTransferToken_RevertWhen_InsufficientBalance() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        // Don't fund the contract
        address[] memory recipients = new address[](1);
        recipients[0] = user1;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 * 10 ** 18;

        // Act & Assert
        vm.prank(operator);
        vm.expectRevert("Insufficient token balance");
        batchTransfer.batchTransferToken(address(token), recipients, amounts);
    }

    // ============ Role Management Tests ============

    function testGrantTransferRole_Success() public {
        // Arrange & Act
        batchTransfer.grantTransferRole(operator);

        // Assert
        assertTrue(
            batchTransfer.hasRole(batchTransfer.TRANSFER_ROLE(), operator),
            "Operator should have TRANSFER_ROLE"
        );
    }

    function testGrantTransferRole_RevertWhen_NotAdmin() public {
        // Act & Assert
        vm.prank(operator);
        vm.expectRevert();
        batchTransfer.grantTransferRole(address(0x999));
    }

    function testRevokeTransferRole_Success() public {
        // Arrange: Grant role first
        batchTransfer.grantTransferRole(operator);

        // Act: Revoke role
        batchTransfer.revokeTransferRole(operator);

        // Assert
        assertFalse(
            batchTransfer.hasRole(batchTransfer.TRANSFER_ROLE(), operator),
            "Operator should not have TRANSFER_ROLE"
        );
    }

    function testRevokeTransferRole_RevertWhen_NotAdmin() public {
        // Arrange
        vm.prank(admin);
        batchTransfer.grantTransferRole(operator);

        // Act & Assert
        vm.prank(operator);
        vm.expectRevert();
        batchTransfer.revokeTransferRole(operator);
    }

    // ============ Edge Cases ============

    function testBatchTransferETH_EmptyArray() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        vm.deal(address(batchTransfer), 10 ether);

        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);

        // Act
        vm.prank(operator);
        batchTransfer.batchTransferETH(recipients, amounts);

        // Assert: No transfers, no reverts
        assertEq(address(batchTransfer).balance, 10 ether, "Balance should remain unchanged");
    }

    function testBatchTransferToken_EmptyArray() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);

        // Act
        vm.prank(operator);
        batchTransfer.batchTransferToken(address(token), recipients, amounts);

        // Assert: No transfers, no reverts
        assertEq(token.balanceOf(user1), 0, "User1 should have 0 tokens");
    }

    function testBatchTransferETH_SingleRecipient() public {
        // Arrange
        batchTransfer.grantTransferRole(operator);

        vm.deal(address(batchTransfer), 10 ether);

        address[] memory recipients = new address[](1);
        recipients[0] = user1;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;

        uint256 user1BalanceBefore = user1.balance;

        // Act
        vm.prank(operator);
        batchTransfer.batchTransferETH(recipients, amounts);

        // Assert
        assertEq(user1.balance, user1BalanceBefore + 5 ether, "User1 should receive 5 ETH");
        assertEq(address(batchTransfer).balance, 5 ether, "Contract should have 5 ETH remaining");
    }

    function testReceiveETH() public {
        // Arrange
        uint256 sendAmount = 1 ether;

        // Act: Send ETH directly to contract
        vm.deal(address(0x1234), sendAmount);
        vm.prank(address(0x1234));
        (bool success, ) = address(batchTransfer).call{ value: sendAmount }("");

        // Assert
        assertTrue(success, "ETH transfer should succeed");
        assertEq(address(batchTransfer).balance, sendAmount, "Contract should receive the ETH");
    }
}
