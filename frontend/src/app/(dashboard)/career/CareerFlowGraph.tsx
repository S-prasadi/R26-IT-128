"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CareerPrediction, CareerGraphNode } from "@/types";
import { readinessColor, VELOCITY_META } from "@/lib/career-ui";

type RoleNodeData = { node: CareerGraphNode };

function RoleNode({ data }: NodeProps<Node<RoleNodeData>>) {
  const n = data.node;
  const isCurrent = n.type === "current";
  const meta = n.meta ?? {};
  const isGoal = !!meta.is_goal;
  const ring = isGoal ? "#f59e0b" : isCurrent ? "#0ea5e9" : readinessColor(meta.readiness, "#64748b");
  const vel = VELOCITY_META[meta.market?.velocity ?? "unknown"];
  return (
    <div
      style={{
        width: 184,
        padding: "10px 12px",
        borderRadius: 12,
        background: "var(--surf, #fff)",
        border: `2px solid ${ring}`,
        boxShadow: isGoal ? "0 0 0 3px #f59e0b33, 0 1px 4px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.08)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: isGoal ? "#f59e0b" : isCurrent ? "#0ea5e9" : "var(--text3,#94a3b8)" }}>
        {isGoal ? "🎯 Your goal" : isCurrent ? "You are here" : "Role"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginTop: 2, color: "var(--text,#0f172a)" }}>{n.label}</div>
      {!isCurrent && (
        <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, alignItems: "center", flexWrap: "wrap" }}>
          {meta.readiness != null && (
            <span style={{ color: ring, fontWeight: 600 }}>{Math.round(meta.readiness * 100)}% ready</span>
          )}
          {meta.market && meta.market.velocity !== "unknown" && (
            <span style={{ color: vel.color, fontWeight: 600 }}>{vel.arrow} {meta.market.demand_index}</span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { role: RoleNode };

function buildLayout(prediction: CareerPrediction): { nodes: Node[]; edges: Edge[] } {
  const gnodes = prediction.graph_nodes ?? [];
  const gedges = prediction.graph_edges ?? [];

  // Depth = longest distance from a "current" root, via BFS over edges.
  const adj = new Map<string, string[]>();
  for (const e of gedges) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  const depth = new Map<string, number>();
  const roots = gnodes.filter((n) => n.type === "current").map((n) => n.id);
  const queue = roots.map((id) => { depth.set(id, 0); return id; });
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of adj.get(id) ?? []) {
      const d = (depth.get(id) ?? 0) + 1;
      if (d > (depth.get(t) ?? -1)) { depth.set(t, d); queue.push(t); }
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const n of gnodes) {
    const d = depth.get(n.id) ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), n.id]);
  }

  const ROW_H = 150, COL_W = 230;
  const nodes: Node[] = gnodes.map((gn) => {
    const d = depth.get(gn.id) ?? 0;
    const row = byDepth.get(d)!;
    const idx = row.indexOf(gn.id);
    const x = idx * COL_W - ((row.length - 1) * COL_W) / 2;
    return {
      id: gn.id,
      type: "role",
      position: { x, y: d * ROW_H },
      data: { node: gn },
    };
  });

  const edges: Edge[] = gedges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    label: e.timeframe,
    animated: true,
    style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "var(--text2,#64748b)" },
    labelBgStyle: { fill: "var(--surf2,#f1f5f9)", fillOpacity: 0.9 },
  }));

  return { nodes, edges };
}

export default function CareerFlowGraph({
  prediction,
  onSelect,
}: {
  prediction: CareerPrediction;
  onSelect: (node: CareerGraphNode) => void;
}) {
  const { nodes, edges } = useMemo(() => buildLayout(prediction), [prediction]);
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => onSelect((node.data as RoleNodeData).node),
    [onSelect]
  );

  return (
    <div style={{ height: 480, borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background gap={20} color="var(--border, #e2e8f0)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
