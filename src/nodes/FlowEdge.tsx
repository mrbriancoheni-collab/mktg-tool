import { memo, useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { num } from "../lib/format";
import { useStore, type FlowEdge as FlowEdgeT } from "../lib/store";
import { SimContext } from "./StageNode";

function FlowEdgeImpl(props: EdgeProps<FlowEdgeT>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, markerEnd } = props;
  const sim = useContext(SimContext);
  const view = useStore((s) => s.view);
  const isTracking = useStore((s) => {
    const kinds = s.nodes.filter((n) => n.id === source || n.id === target).map((n) => n.data.kind);
    return kinds.includes("integration") || kinds.includes("note");
  });
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const flow = sim?.edges[id] ?? 0;
  const max = Math.max(1, ...Object.values(sim?.edges ?? {}));
  const width = isTracking ? 1.5 : view === "analyze" ? 2 + 10 * Math.sqrt(flow / max) : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={isTracking ? "edge-tracking" : view === "analyze" ? "edge-flow animated-flow" : "edge-flow"}
        style={{ strokeWidth: width, stroke: selected ? "var(--brand)" : undefined }}
      />
      {view === "analyze" && !isTracking && (
        <EdgeLabelRenderer>
          <div className="edge-label" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            {num(flow)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeImpl);
