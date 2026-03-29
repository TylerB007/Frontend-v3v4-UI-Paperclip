// ABIs for Viem type inference on readContract / multicall.
// tsconfig.json must have "resolveJsonModule": true (already set).
// JSON imports are already deeply typed by TypeScript — no `as const` needed.

import StateViewJson from "./StateView.json";
import PositionManagerJson from "./PositionManager.json";

export const STATE_VIEW_ABI = StateViewJson;
export const POSITION_MANAGER_ABI = PositionManagerJson;
