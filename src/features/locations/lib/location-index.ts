import { useMemo } from 'react';
import type { SelectOption } from '@/components/common/fields';
import { localizedName } from '@/lib/utils';
import type { LocationTreeNode } from '@/types/entities';
import { useLocationTree } from '../api';

/**
 * The location tree, flattened into the lookups an address picker needs.
 *
 * The whole tree arrives in one cached request (about 680 rows) and every
 * picker filters it here, so changing a province costs nothing and no list ever
 * lags a keystroke behind.
 */
export interface LocationIndex {
  /** The roots, in tree order. */
  provinces: LocationTreeNode[];
  byId: Map<string, LocationTreeNode>;
  parentOf: Map<string, LocationTreeNode>;
  isLoading: boolean;
}

export function useLocationIndex(): LocationIndex {
  const { data: tree, isLoading } = useLocationTree();

  const index = useMemo(() => {
    const byId = new Map<string, LocationTreeNode>();
    const parentOf = new Map<string, LocationTreeNode>();
    // The endpoint answers with an array of roots. Anything else is a failed or
    // stubbed response, and an address field is no reason to take a form down.
    const roots = Array.isArray(tree) ? tree : [];

    const walk = (nodes: LocationTreeNode[], parent?: LocationTreeNode) => {
      for (const node of nodes) {
        byId.set(node.id, node);
        if (parent) parentOf.set(node.id, parent);
        if (node.children?.length) walk(node.children, node);
      }
    };

    walk(roots);
    return { provinces: roots, byId, parentOf };
  }, [tree]);

  return { ...index, isLoading };
}

/**
 * `ບ້ານອານຸ, ຈັນທະບູລີ, ນະຄອນຫຼວງວຽງຈັນ` — deepest first, as an address is said.
 *
 * Built from the tree rather than from the populated node, whose `ancestors` are
 * ids and carry no names. A node that may sit at any level needs this: a village
 * name shown alone is ambiguous, since eleven capital village names are borne by
 * more than one village.
 */
export function locationPath(
  index: Pick<LocationIndex, 'byId' | 'parentOf'>,
  id: string | null | undefined,
  language: string,
): string | null {
  if (!id) return null;
  const node = index.byId.get(id);
  if (!node) return null;

  const names: string[] = [];
  for (let current = node; current; current = index.parentOf.get(current.id) as LocationTreeNode) {
    names.push(localizedName(current, language));
    if (!index.parentOf.has(current.id)) break;
  }
  return names.join(', ');
}

/** A local list dressed up as `EntitySelect`'s server-search hook. */
export function localOptions(options: SelectOption[]) {
  return (search: string) => {
    const needle = search.trim().toLowerCase();
    return {
      isLoading: false,
      data: needle
        ? options.filter((option) => option.label.toLowerCase().includes(needle))
        : options,
    };
  };
}
