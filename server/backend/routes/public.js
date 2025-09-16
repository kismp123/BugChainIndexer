const { Router } = require('express');
const ctrl = require('../controllers/address.controller');

const router = Router();

// Endpoints
router.get('/getAddressesByFilter', ctrl.getAddressesByFilter);
router.get('/getContractCount', ctrl.getContractCount);
router.get('/networkCounts', ctrl.getNetworkCounts);

module.exports = router;
