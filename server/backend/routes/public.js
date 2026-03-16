const { Router } = require('express');
const ctrl = require('../controllers/address.controller');
const approvalCtrl = require('../controllers/approval.controller');

const router = Router();

// Address endpoints
router.get('/getAddressesByFilter', ctrl.getAddressesByFilter);
router.get('/getContractCount', ctrl.getContractCount);
router.get('/networkCounts', ctrl.getNetworkCounts);

// Approval endpoints
router.get('/approvals', approvalCtrl.getApprovals);
router.get('/approvals/stats', approvalCtrl.getApprovalStats);

module.exports = router;
