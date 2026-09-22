export { openShipments, openTransportOrders } from './operations-core.js?v=20260921-live-1790038841635';
import { openShipments, openTransportOrders } from './operations-core.js?v=20260921-live-1790038841635';
import './operations-save-stable.js?v=20260907-core1';
window.nodaraOperations={...(window.nodaraOperations||{}),shipments:openShipments,transportOrders:openTransportOrders};
