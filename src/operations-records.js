export { openShipments, openTransportOrders } from './operations-core.js?v=20260906-core4';
import './operations-core.js?v=20260906-core4';
import './operations-save-stable.js?v=20260907-core1';
// Canonical detail is a progressive enhancement. Keep it out of the critical
// startup import graph so a detail-layer regression can never prevent NODARA
// from booting. It will be re-enabled from a non-critical loader after smoke tests.
