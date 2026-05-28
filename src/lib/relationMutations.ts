import type { RelationsFile } from '../types';

function cloneConnectors(
  connectors: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(connectors).map(([key, values]) => [key, [...values]]),
  );
}

export function addBidirectionalConnector(
  connectors: Record<string, string[]>,
  a: string,
  b: string,
): Record<string, string[]> {
  if (a === b) return connectors;

  const next = cloneConnectors(connectors);
  const link = (from: string, to: string) => {
    const list = next[from] ? [...next[from]] : [];
    if (!list.includes(to)) {
      list.push(to);
      next[from] = list;
    }
  };

  link(a, b);
  link(b, a);
  return next;
}

export function removeBidirectionalConnector(
  connectors: Record<string, string[]>,
  a: string,
  b: string,
): Record<string, string[]> {
  if (a === b) return connectors;

  const next = cloneConnectors(connectors);
  const unlink = (from: string, to: string) => {
    if (!next[from]) return;
    const list = next[from].filter((id) => id !== to);
    if (list.length === 0) delete next[from];
    else next[from] = list;
  };

  unlink(a, b);
  unlink(b, a);
  return next;
}

export function linkComponentToGroup(
  relations: RelationsFile,
  componentId: string,
  groupIds: Iterable<string>,
): RelationsFile {
  let connectors = relations.connectors;
  for (const otherId of groupIds) {
    if (otherId !== componentId) {
      connectors = addBidirectionalConnector(connectors, componentId, otherId);
    }
  }
  return { connectors };
}

export function unlinkComponentFromGroup(
  relations: RelationsFile,
  componentId: string,
  groupIds: Iterable<string>,
): RelationsFile {
  let connectors = relations.connectors;
  for (const otherId of groupIds) {
    if (otherId !== componentId) {
      connectors = removeBidirectionalConnector(connectors, componentId, otherId);
    }
  }
  return { connectors };
}
