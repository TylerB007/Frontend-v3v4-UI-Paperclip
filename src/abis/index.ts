// ABIs for Viem type inference on readContract / multicall.
// tsconfig.json must have "resolveJsonModule": true (already set).
// Cast to Abi to satisfy viem's strict readonly literal type requirement.

import { type Abi } from "viem";
import StateViewJson from "./StateView.json";
import PositionManagerJson from "./PositionManager.json";
import UniversalRouterJson from "./UniversalRouter.json";
import Permit2Json from "./Permit2.json";
import V4QuoterJson from "./V4Quoter.json";

export const STATE_VIEW_ABI = StateViewJson as Abi;
export const POSITION_MANAGER_ABI = PositionManagerJson as Abi;
export const UNIVERSAL_ROUTER_ABI = UniversalRouterJson as Abi;
export const PERMIT2_ABI = Permit2Json as Abi;
export const V4_QUOTER_ABI = V4QuoterJson as Abi;
