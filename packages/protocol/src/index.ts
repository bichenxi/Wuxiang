export const PROTOCOL_VERSION = "0.1" as const;

export type NodeId = string;

export type SurfaceAction = {
  id: string;
  label?: string;
};

export type TextNode = {
  type: "text";
  id: NodeId;
  text: string;
  tone?: "default" | "muted" | "accent" | "danger";
};

export type CardNode = {
  type: "card";
  id: NodeId;
  title?: string;
  description?: string;
  children: SurfaceNode[];
};

export type StackNode = {
  type: "stack";
  id: NodeId;
  direction?: "row" | "column";
  gap?: "sm" | "md" | "lg";
  children: SurfaceNode[];
};

export type ButtonNode = {
  type: "button";
  id: NodeId;
  label: string;
  actionId: string;
  variant?: "primary" | "secondary" | "quiet";
  disabled?: boolean;
};

export type InputNode = {
  type: "input";
  id: NodeId;
  field: string;
  label: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export type SelectOption = { value: string; label: string };

export type SelectNode = {
  type: "select";
  id: NodeId;
  field: string;
  label: string;
  value?: string;
  options: SelectOption[];
  required?: boolean;
  disabled?: boolean;
};

export type FormNode = {
  type: "form";
  id: NodeId;
  children: SurfaceNode[];
  submitActionId?: string;
};

export type TableColumn = { key: string; label: string };
export type TableNode = {
  type: "table";
  id: NodeId;
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
};

export type ProgressNode = {
  type: "progress";
  id: NodeId;
  value: number;
  label?: string;
};

export type SurfaceNode =
  | TextNode
  | CardNode
  | StackNode
  | ButtonNode
  | InputNode
  | SelectNode
  | FormNode
  | TableNode
  | ProgressNode;

export type Surface = {
  version: typeof PROTOCOL_VERSION;
  surfaceId: string;
  revision: number;
  nodes: SurfaceNode[];
  actions: SurfaceAction[];
};

export type SurfaceEvent = {
  eventId: string;
  surfaceId: string;
  revision: number;
  actionId: string;
  payload?: unknown;
};

export const MAX_TREE_DEPTH = 12;
export const MAX_NODE_COUNT = 200;
export const MAX_SURFACE_BYTES = 200_000;

export class SurfaceValidationError extends Error {
  readonly path: string;
  constructor(message: string, path = "surface") {
    super(`${path}: ${message}`);
    this.name = "SurfaceValidationError";
    this.path = path;
  }
}

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SurfaceValidationError("expected object", path);
  return value as Record<string, unknown>;
};
const string = (value: unknown, path: string): string => {
  if (typeof value !== "string" || (value.length === 0 && !path.includes(".rows[")) || value.length > 10_000) throw new SurfaceValidationError("expected a non-empty string", path);
  return value;
};
const text = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.length > 10_000) throw new SurfaceValidationError("expected a string", path);
  return value;
};
const integer = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new SurfaceValidationError("expected a non-negative integer", path);
  return value;
};
const optionalString = (obj: Record<string, unknown>, key: string, path: string): string | undefined => obj[key] === undefined ? undefined : string(obj[key], `${path}.${key}`);
const exact = (obj: Record<string, unknown>, allowed: readonly string[], path: string): void => {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw new SurfaceValidationError(`unknown field '${key}'`, `${path}.${key}`);
};
const enumValue = <T extends string>(value: unknown, values: readonly T[], path: string): T => {
  if (typeof value !== "string" || !values.includes(value as T)) throw new SurfaceValidationError(`expected one of ${values.join(", ")}`, path);
  return value as T;
};

function parseAction(value: unknown, path: string): SurfaceAction {
  const obj = object(value, path);
  exact(obj, ["id", "label"], path);
  const action: SurfaceAction = { id: string(obj.id, `${path}.id`) };
  const label = optionalString(obj, "label", path);
  if (label !== undefined) action.label = label;
  return action;
}

type ParseState = { count: number; nodeIds: Set<string>; fields: Set<string>; formDepth: number };
function parseNode(value: unknown, path: string, state: ParseState, depth: number): SurfaceNode {
  if (depth > MAX_TREE_DEPTH) throw new SurfaceValidationError(`tree depth exceeds ${MAX_TREE_DEPTH}`, path);
  state.count += 1;
  if (state.count > MAX_NODE_COUNT) throw new SurfaceValidationError(`node count exceeds ${MAX_NODE_COUNT}`, path);
  const obj = object(value, path);
  const type = enumValue(obj.type, ["text", "card", "stack", "button", "input", "select", "form", "table", "progress"] as const, `${path}.type`);
  const id = string(obj.id, `${path}.id`);
  if (state.nodeIds.has(id)) throw new SurfaceValidationError("duplicate node id", `${path}.id`);
  state.nodeIds.add(id);
  if (type === "form" && state.formDepth > 0) throw new SurfaceValidationError("nested forms are not supported", path);
  const children = (raw: unknown, childPath: string): SurfaceNode[] => {
    if (!Array.isArray(raw)) throw new SurfaceValidationError("expected array", childPath);
    return raw.map((child, index) => parseNode(child, `${childPath}[${index}]`, state, depth + 1));
  };
  switch (type) {
    case "text": {
      exact(obj, ["type", "id", "text", "tone"], path);
      const node: TextNode = { type, id, text: string(obj.text, `${path}.text`) };
      if (obj.tone !== undefined) node.tone = enumValue(obj.tone, ["default", "muted", "accent", "danger"] as const, `${path}.tone`);
      return node;
    }
    case "card": {
      exact(obj, ["type", "id", "title", "description", "children"], path);
      const node: CardNode = { type, id, children: children(obj.children, `${path}.children`) };
      const title = optionalString(obj, "title", path); const description = optionalString(obj, "description", path);
      if (title !== undefined) node.title = title; if (description !== undefined) node.description = description;
      return node;
    }
    case "stack": {
      exact(obj, ["type", "id", "direction", "gap", "children"], path);
      const node: StackNode = { type, id, children: children(obj.children, `${path}.children`) };
      if (obj.direction !== undefined) node.direction = enumValue(obj.direction, ["row", "column"] as const, `${path}.direction`);
      if (obj.gap !== undefined) node.gap = enumValue(obj.gap, ["sm", "md", "lg"] as const, `${path}.gap`);
      return node;
    }
    case "button": {
      exact(obj, ["type", "id", "label", "actionId", "variant", "disabled"], path);
      const node: ButtonNode = { type, id, label: string(obj.label, `${path}.label`), actionId: string(obj.actionId, `${path}.actionId`) };
      if (obj.variant !== undefined) node.variant = enumValue(obj.variant, ["primary", "secondary", "quiet"] as const, `${path}.variant`);
      if (obj.disabled !== undefined) { if (typeof obj.disabled !== "boolean") throw new SurfaceValidationError("expected boolean", `${path}.disabled`); node.disabled = obj.disabled; }
      return node;
    }
    case "input": {
      exact(obj, ["type", "id", "field", "label", "value", "placeholder", "required", "disabled"], path);
      const node: InputNode = { type, id, field: string(obj.field, `${path}.field`), label: string(obj.label, `${path}.label`) };
      if (state.fields.has(node.field)) throw new SurfaceValidationError("duplicate field", `${path}.field`); state.fields.add(node.field);
      const value = obj.value === undefined ? undefined : text(obj.value, `${path}.value`); const placeholder = obj.placeholder === undefined ? undefined : text(obj.placeholder, `${path}.placeholder`);
      if (value !== undefined) node.value = value; if (placeholder !== undefined) node.placeholder = placeholder;
      if (obj.required !== undefined) { if (typeof obj.required !== "boolean") throw new SurfaceValidationError("expected boolean", `${path}.required`); node.required = obj.required; }
      if (obj.disabled !== undefined) { if (typeof obj.disabled !== "boolean") throw new SurfaceValidationError("expected boolean", `${path}.disabled`); node.disabled = obj.disabled; }
      return node;
    }
    case "select": {
      exact(obj, ["type", "id", "field", "label", "value", "options", "required", "disabled"], path);
      if (!Array.isArray(obj.options) || obj.options.length > 100) throw new SurfaceValidationError("expected up to 100 options", `${path}.options`);
      const optionValues = new Set<string>();
      const options = obj.options.map((raw, index) => { const item = object(raw, `${path}.options[${index}]`); exact(item, ["value", "label"], `${path}.options[${index}]`); const option = { value: string(item.value, `${path}.options[${index}].value`), label: string(item.label, `${path}.options[${index}].label`) }; if (optionValues.has(option.value)) throw new SurfaceValidationError("duplicate option value", `${path}.options[${index}].value`); optionValues.add(option.value); return option; });
      const node: SelectNode = { type, id, field: string(obj.field, `${path}.field`), label: string(obj.label, `${path}.label`), options };
      if (state.fields.has(node.field)) throw new SurfaceValidationError("duplicate field", `${path}.field`); state.fields.add(node.field);
      const value = obj.value === undefined ? undefined : text(obj.value, `${path}.value`); if (value !== undefined) { if (value !== "" && !optionValues.has(value)) throw new SurfaceValidationError("value must be one of the options", `${path}.value`); node.value = value; }
      if (obj.required !== undefined) { if (typeof obj.required !== "boolean") throw new SurfaceValidationError("expected boolean", `${path}.required`); node.required = obj.required; }
      if (obj.disabled !== undefined) { if (typeof obj.disabled !== "boolean") throw new SurfaceValidationError("expected boolean", `${path}.disabled`); node.disabled = obj.disabled; }
      return node;
    }
    case "form": {
      exact(obj, ["type", "id", "children", "submitActionId"], path);
      state.formDepth += 1;
      const formChildren = children(obj.children, `${path}.children`);
      state.formDepth -= 1;
      const node: FormNode = { type, id, children: formChildren };
      const action = optionalString(obj, "submitActionId", path); if (action !== undefined) node.submitActionId = action;
      return node;
    }
    case "table": {
      exact(obj, ["type", "id", "columns", "rows"], path);
      if (!Array.isArray(obj.columns) || obj.columns.length > 30) throw new SurfaceValidationError("expected up to 30 columns", `${path}.columns`);
      const columnKeys = new Set<string>();
      const columns = obj.columns.map((raw, index) => { const item = object(raw, `${path}.columns[${index}]`); exact(item, ["key", "label"], `${path}.columns[${index}]`); const key = string(item.key, `${path}.columns[${index}].key`); if (key === "__proto__" || key === "constructor" || key === "prototype" || columnKeys.has(key)) throw new SurfaceValidationError("invalid or duplicate column key", `${path}.columns[${index}].key`); columnKeys.add(key); return { key, label: string(item.label, `${path}.columns[${index}].label`) }; });
      if (!Array.isArray(obj.rows) || obj.rows.length > 1_000) throw new SurfaceValidationError("expected up to 1000 rows", `${path}.rows`);
      const keys = new Set(columns.map((column) => column.key));
      const rows = obj.rows.map((raw, index) => { const item = object(raw, `${path}.rows[${index}]`); for (const key of Object.keys(item)) if (!keys.has(key)) throw new SurfaceValidationError(`unknown column '${key}'`, `${path}.rows[${index}].${key}`); const row: Record<string, string> = {}; for (const key of keys) { if (item[key] !== undefined) row[key] = text(item[key], `${path}.rows[${index}].${key}`); } return row; });
      return { type, id, columns, rows };
    }
    case "progress": {
      exact(obj, ["type", "id", "value", "label"], path);
      if (typeof obj.value !== "number" || !Number.isFinite(obj.value) || obj.value < 0 || obj.value > 100) throw new SurfaceValidationError("expected a number from 0 to 100", `${path}.value`);
      const node: ProgressNode = { type, id, value: obj.value }; const label = optionalString(obj, "label", path); if (label !== undefined) node.label = label; return node;
    }
  }
}

export function parseSurface(input: unknown): Surface {
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { throw new SurfaceValidationError("input must be finite JSON data", "surface"); }
  if (typeof serialized !== "string") throw new SurfaceValidationError("input must be finite JSON data", "surface");
  if (serialized.length > MAX_SURFACE_BYTES) throw new SurfaceValidationError(`serialized surface exceeds ${MAX_SURFACE_BYTES} bytes`, "surface");
  const obj = object(input, "surface");
  exact(obj, ["version", "surfaceId", "revision", "nodes", "actions"], "surface");
  if (obj.version !== PROTOCOL_VERSION) throw new SurfaceValidationError(`unsupported version '${String(obj.version)}'`, "surface.version");
  const surfaceId = string(obj.surfaceId, "surface.surfaceId");
  const revision = integer(obj.revision, "surface.revision");
  if (!Array.isArray(obj.nodes) || obj.nodes.length > MAX_NODE_COUNT) throw new SurfaceValidationError(`expected up to ${MAX_NODE_COUNT} root nodes`, "surface.nodes");
  if (!Array.isArray(obj.actions) || obj.actions.length > 100) throw new SurfaceValidationError("expected up to 100 actions", "surface.actions");
  const actions = obj.actions.map((action, index) => parseAction(action, `surface.actions[${index}]`));
  const actionIds = new Set<string>(); for (const action of actions) { if (actionIds.has(action.id)) throw new SurfaceValidationError("duplicate action id", `surface.actions.${action.id}`); actionIds.add(action.id); }
  const state: ParseState = { count: 0, nodeIds: new Set(), fields: new Set(), formDepth: 0 }; const nodes = obj.nodes.map((node, index) => parseNode(node, `surface.nodes[${index}]`, state, 1));
  const nodeActions: string[] = [];
  const visit = (node: SurfaceNode): void => { if (node.type === "button") nodeActions.push(node.actionId); if (node.type === "form" && node.submitActionId) nodeActions.push(node.submitActionId); if ("children" in node) node.children.forEach(visit); };
  nodes.forEach(visit); for (const id of nodeActions) if (!actionIds.has(id)) throw new SurfaceValidationError(`action '${id}' is not allowlisted`, "surface.actions");
  return structuredClone({ version: PROTOCOL_VERSION, surfaceId, revision, nodes, actions });
}

export const validateSurface = parseSurface;

export function isSurface(input: unknown): input is Surface {
  try { parseSurface(input); return true; } catch { return false; }
}

export function cloneSurface(surface: Surface): Surface { return structuredClone(surface); }
