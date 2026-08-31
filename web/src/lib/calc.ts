// web/src/lib/calc.ts
export type MetricType = "checkbox" | "number" | "score" | "count" | "time" | "hhmm" | "text";

export type MetricDef = {
  metric_id: string;
  type: MetricType;
  is_calculated: boolean;
  calc_expr: string | null;
};

export type NumericContext = Record<string, number | null>;

type Token =
  | { kind: "number"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "call"; fn: string; argsRaw: string }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

function splitTopLevelArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

function diffMinutes(a: number, b: number): number {
  const d = a - b;
  return d >= 0 ? d : d + 1440;
}

function tokenizeExpr(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // number
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const numStr = expr.slice(i, j);
      const n = Number(numStr);
      if (!Number.isFinite(n)) return null;
      tokens.push({ kind: "number", value: n });
      i = j;
      continue;
    }

    // identifier (or function call, if immediately followed by "(")
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      const name = expr.slice(i, j);

      if (expr[j] === "(") {
        // Capture the balanced-paren argument list as a single call token so
        // that function calls (e.g. prev(x)) can be combined with arithmetic
        // operators, not just stand alone as the entire expression.
        let depth = 1;
        let k = j + 1;
        while (k < expr.length && depth > 0) {
          if (expr[k] === "(") depth++;
          else if (expr[k] === ")") depth--;
          if (depth === 0) break;
          k++;
        }
        if (depth !== 0) return null;
        const argsRaw = expr.slice(j + 1, k);
        tokens.push({ kind: "call", fn: name, argsRaw });
        i = k + 1;
        continue;
      }

      tokens.push({ kind: "ident", name });
      i = j;
      continue;
    }

    // ops
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }

    // parens
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch });
      i++;
      continue;
    }

    // unsupported char
    return null;
  }

  return tokens;
}

function toRpn(tokens: Token[]): (Token & { kind: "number" | "ident" | "call" | "op" })[] | null {
  const output: (Token & { kind: "number" | "ident" | "call" | "op" })[] = [];
  const ops: ("+" | "-" | "*" | "/" | "(")[] = [];
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  for (const t of tokens) {
    if (t.kind === "number" || t.kind === "ident" || t.kind === "call") {
      output.push(t as any);
    } else if (t.kind === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top === "(") break;
        if (precedence[top] >= precedence[t.op]) {
          output.push({ kind: "op", op: ops.pop()! } as any);
        } else break;
      }
      ops.push(t.op);
    } else if (t.kind === "paren" && t.value === "(") {
      ops.push("(");
    } else if (t.kind === "paren" && t.value === ")") {
      let found = false;
      while (ops.length > 0) {
        const top = ops.pop()!;
        if (top === "(") {
          found = true;
          break;
        }
        output.push({ kind: "op", op: top } as any);
      }
      if (!found) return null;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top === "(") return null;
    output.push({ kind: "op", op: top } as any);
  }

  return output;
}

type Resolver = (name: string) => { value: number | null; type?: MetricType };

function evalRpn(
  rpn: (Token & { kind: "number" | "ident" | "call" | "op" })[],
  resolve: Resolver,
  evalCall?: (fn: string, argsRaw: string) => number | null
): number | null {
  const stack: number[] = [];

  for (const t of rpn) {
    if (t.kind === "number") {
      stack.push(t.value);
      continue;
    }
    if (t.kind === "ident") {
      const { value, type } = resolve(t.name);
      // arithmetic treats missing checkbox as 0
      if (type === "checkbox") {
        stack.push(value ?? 0);
      } else {
        if (value == null) return null;
        stack.push(value);
      }
      continue;
    }
    if (t.kind === "call") {
      if (!evalCall) return null;
      const v = evalCall(t.fn, t.argsRaw);
      if (v == null) return null;
      stack.push(v);
      continue;
    }
    if (t.kind === "op") {
      if (stack.length < 2) return null;
      const b = stack.pop()!;
      const a = stack.pop()!;
      if (a == null || b == null) return null;
      let res: number;
      switch (t.op) {
        case "+": res = a + b; break;
        case "-": res = a - b; break;
        case "*": res = a * b; break;
        case "/":
          if (b === 0) return null;
          res = a / b;
          break;
        default:
          return null;
      }
      if (!Number.isFinite(res)) return null;
      stack.push(res);
      continue;
    }
  }

  if (stack.length !== 1) return null;
  return stack[0];
}

function isIdentOnly(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

function parseFunctionCall(s: string): { fn: string; argsRaw: string } | null {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/.exec(s.trim());
  if (!m) return null;
  return { fn: m[1], argsRaw: m[2] };
}

export function evaluateCalculatedMetricsV2(
  defs: MetricDef[],
  ctxTodayRaw: Record<string, number | null>,
  prevByN: Record<number, Record<string, number | null>>
): {
  values: Record<string, number | null>;
  errors: Record<string, string | null>;
  missing: Record<string, string[]>;
} {
  const defsById: Record<string, MetricDef> = {};
  for (const d of defs) defsById[d.metric_id] = d;

  const cache: Record<string, number | null> = {};
  const missing: Record<string, string[]> = {};
  const errors: Record<string, string | null> = {};
  const visiting = new Set<string>();

  const addMissing = (forMetric: string, dep: string) => {
    if (!missing[forMetric]) missing[forMetric] = [];
    if (!missing[forMetric].includes(dep)) missing[forMetric].push(dep);
    };

  const resolve: Resolver = (name) => {
    const def = defsById[name];

    // unknown metric id: treat as today context
    if (!def) {
        const v = ctxTodayRaw[name] ?? null;
        if (v == null && currentMetricId) addMissing(currentMetricId, `${name}(today)`);
        return { value: v };
    }

    if (!def.is_calculated) {
        const v = ctxTodayRaw[name] ?? null;
        if (v == null && currentMetricId) addMissing(currentMetricId, `${name}(today)`);
        return { value: v, type: def.type };
    }

    const v = evalMetric(name);
    if (v == null && currentMetricId) addMissing(currentMetricId, `${name}(calc)`);
    return { value: v, type: def.type };
    };


  const evalExpr = (expr: string): number | null => {
    const s = expr.trim();
    if (!s) return null;

    // Identifier alone
    if (isIdentOnly(s)) {
      return resolve(s).value ?? null;
    }

    // Function call
    const call = parseFunctionCall(s);
    if (call) {
      const fn = call.fn;
      const args = splitTopLevelArgs(call.argsRaw);

        // prev(id) or prev(id, n)
        if (fn === "prev") {
        if (args.length < 1 || args.length > 2) return null;

        const id = args[0].trim();
        if (!isIdentOnly(id)) return null;

        const nRaw = args.length === 2 ? Number(args[1].trim()) : 1;
        if (!Number.isFinite(nRaw) || Math.floor(nRaw) !== nRaw || nRaw < 1) return null;

        const n = nRaw;

        // Base case: look up the context for that offset
        const ctxN = prevByN?.[n];
        if (!ctxN) {
            if (currentMetricId) addMissing(currentMetricId, `${id}(prev:${n})`);
            return null;
        }

        // If prev references a calculated metric, we can evaluate it using that day's context.
        // NOTE: this supports prev() of calculated metrics recursively.
        const def = defsById[id];
        if (def?.is_calculated) {
            const engine = evaluateCalculatedMetricsV2(defs, ctxN, prevByN);
            const v = engine.values[id] ?? null;
            if (v == null && currentMetricId) {
            // if it's null, missing info will be recorded by the nested engine, but we can still annotate
            addMissing(currentMetricId, `${id}(prev:${n})`);
            }
            return v;
        }

        const pv = ctxN[id] ?? null;
        if (pv == null && currentMetricId) addMissing(currentMetricId, `${id}(prev:${n})`);
        return pv;
        }


      // diff(a,b) -> minutes wraparound positive
      if (fn === "diff") {
        if (args.length !== 2) return null;
        const a = evalExpr(args[0]);
        const b = evalExpr(args[1]);
        if (a == null || b == null) return null;
        return diffMinutes(a, b);
      }

      // or(...) -> boolean OR (null treated as 0)
      if (fn === "or") {
        if (args.length < 1) return null;
        for (const a of args) {
          const v = evalExpr(a);
          if ((v ?? 0) !== 0) return 1;
        }
        return 0;
      }

      // and(...) -> boolean AND (null treated as 0)
      if (fn === "and") {
        if (args.length < 1) return null;
        for (const a of args) {
          const v = evalExpr(a);
          if ((v ?? 0) === 0) return 0;
        }
        return 1;
      }

      // not(x)
      if (fn === "not") {
        if (args.length !== 1) return null;
        const v = evalExpr(args[0]);
        return (v ?? 0) === 0 ? 1 : 0;
      }

      // if(cond, a, b) where cond null => false
      if (fn === "if") {
        if (args.length !== 3) return null;
        const cond = evalExpr(args[0]);
        return (cond ?? 0) !== 0 ? evalExpr(args[1]) : evalExpr(args[2]);
      }

      // coalesce(a,b,c...) -> first non-null
      if (fn === "coalesce") {
        if (args.length < 1) return null;
        for (const a of args) {
          const v = evalExpr(a);
          if (v != null) return v;
        }
        return null;
      }

      // abs(x)
      if (fn === "abs") {
        if (args.length !== 1) return null;
        const v = evalExpr(args[0]);
        if (v == null) return null;
        return Math.abs(v);
      }

      // coalesce(a, b, c...) -> first non-null
        if (fn === "coalesce") {
            if (args.length < 1) return null;

            for (let i = 0; i < args.length; i++) {
                const v = evalExpr(args[i]);
                if (v != null) return v;
            }
            return null;
        }

      // comparisons -> 1/0 (null if any input null)
      const cmp = (op: "gt" | "gte" | "lt" | "lte" | "eq" | "ne") => {
        if (args.length !== 2) return null;
        const a = evalExpr(args[0]);
        const b = evalExpr(args[1]);
        if (a == null || b == null) return null;
        switch (op) {
          case "gt": return a > b ? 1 : 0;
          case "gte": return a >= b ? 1 : 0;
          case "lt": return a < b ? 1 : 0;
          case "lte": return a <= b ? 1 : 0;
          case "eq": return a === b ? 1 : 0;
          case "ne": return a !== b ? 1 : 0;
        }
      };

      if (fn === "gt") return cmp("gt");
      if (fn === "gte") return cmp("gte");
      if (fn === "lt") return cmp("lt");
      if (fn === "lte") return cmp("lte");
      if (fn === "eq") return cmp("eq");
      if (fn === "ne") return cmp("ne");

      // Unknown function
      return null;
    }

    // Fallback: arithmetic expression via RPN. Function calls (e.g. prev(x))
    // that appear as a sub-term of a larger expression (e.g. "prev(x) + y")
    // are tokenized as "call" atoms and evaluated by recursing back into
    // evalExpr on their reconstructed "fn(args)" string, so they get the
    // exact same handling as a top-level call.
    const tokens = tokenizeExpr(s);
    if (!tokens) return null;
    const rpn = toRpn(tokens);
    if (!rpn) return null;
    return evalRpn(rpn, resolve, (fn, argsRaw) => evalExpr(`${fn}(${argsRaw})`));
  };

  let currentMetricId: string | null = null;

  const evalMetric = (id: string): number | null => {
    if (id in cache) return cache[id] ?? null;

    const prevMetricId = currentMetricId;
    currentMetricId = id;

    const def = defsById[id];
    if (!def || !def.is_calculated || !def.calc_expr) {
        cache[id] = null;
        currentMetricId = prevMetricId;
        return null;
    }

    if (visiting.has(id)) {
        errors[id] = `Cycle detected while evaluating ${id}`;
        cache[id] = null;
        currentMetricId = prevMetricId;
        return null;
    }

    visiting.add(id);

    try {
        let v = evalExpr(def.calc_expr);
        // hhmm represents a clock time (minutes since midnight, 0-1439). A
        // formula that adds a duration to a clock time (e.g. prev(eat_finish)
        // + fasting_goal) can legitimately cross midnight and land outside
        // that range, so wrap it back into a valid clock time. This is a
        // no-op for formulas (like diff(...)) that already stay in range.
        if (v != null && def.type === "hhmm") {
          v = ((v % 1440) + 1440) % 1440;
        }
        cache[id] = v ?? null;
        errors[id] = null;
        return cache[id];
    } catch (e: any) {
        errors[id] = `Calc error for ${id}: ${String(e?.message || e)}`;
        cache[id] = null;
        return null;
    } finally {
        visiting.delete(id);
        currentMetricId = prevMetricId;
    }
  };


  // Evaluate all calculated metrics once (fills cache + errors)
  const out: Record<string, number | null> = {};
  for (const d of defs) {
    if (d.is_calculated && d.calc_expr) {
      out[d.metric_id] = evalMetric(d.metric_id);
    } else {
      out[d.metric_id] = null;
    }
  }

  return { values: out, errors, missing };
}
