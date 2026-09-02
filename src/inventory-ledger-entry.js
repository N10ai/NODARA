import { open } from './inventory-ledger.js';
const previous=window.nodaraInventoryExplorer||{};
window.nodaraInventoryExplorer={...previous,list:open};
window.nodaraInventoryLedger={open};
