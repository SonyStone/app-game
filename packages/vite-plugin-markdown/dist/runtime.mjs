//#region ../../node_modules/.pnpm/solid-js@1.9.12/node_modules/solid-js/dist/server.js
const ERROR = Symbol("error");
function castError(err) {
	if (err instanceof Error) return err;
	return new Error(typeof err === "string" ? err : "Unknown error", { cause: err });
}
function handleError(err, owner = Owner) {
	const fns = owner && owner.context && owner.context[ERROR];
	const error = castError(err);
	if (!fns) throw error;
	try {
		for (const f of fns) f(error);
	} catch (e) {
		handleError(e, owner && owner.owner || null);
	}
}
let Owner = null;
function createOwner() {
	const o = {
		owner: Owner,
		context: Owner ? Owner.context : null,
		owned: null,
		cleanups: null
	};
	if (Owner) if (!Owner.owned) Owner.owned = [o];
	else Owner.owned.push(o);
	return o;
}
function createMemo(fn, value) {
	Owner = createOwner();
	let v;
	try {
		v = fn(value);
	} catch (err) {
		handleError(err);
	} finally {
		Owner = Owner.owner;
	}
	return () => v;
}
function createContext(defaultValue) {
	const id = Symbol("context");
	return {
		id,
		Provider: createProvider(id),
		defaultValue
	};
}
function children(fn) {
	const memo = createMemo(() => resolveChildren(fn()));
	memo.toArray = () => {
		const c = memo();
		return Array.isArray(c) ? c : c != null ? [c] : [];
	};
	return memo;
}
function resolveChildren(children) {
	if (typeof children === "function" && !children.length) return resolveChildren(children());
	if (Array.isArray(children)) {
		const results = [];
		for (let i = 0; i < children.length; i++) {
			const result = resolveChildren(children[i]);
			Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
		}
		return results;
	}
	return children;
}
function createProvider(id) {
	return function provider(props) {
		return createMemo(() => {
			Owner.context = {
				...Owner.context,
				[id]: props.value
			};
			return children(() => props.children);
		});
	};
}
const sharedConfig = {
	context: void 0,
	getContextId() {
		if (!this.context) throw new Error(`getContextId cannot be used under non-hydrating context`);
		return getContextId(this.context.count);
	},
	getNextContextId() {
		if (!this.context) throw new Error(`getNextContextId cannot be used under non-hydrating context`);
		return getContextId(this.context.count++);
	}
};
function getContextId(count) {
	const num = String(count), len = num.length - 1;
	return sharedConfig.context.id + (len ? String.fromCharCode(96 + len) : "") + num;
}
function setHydrateContext(context) {
	sharedConfig.context = context;
}
function nextHydrateContext() {
	return sharedConfig.context ? {
		...sharedConfig.context,
		id: sharedConfig.getNextContextId(),
		count: 0
	} : void 0;
}
function createComponent(Comp, props) {
	if (sharedConfig.context && !sharedConfig.context.noHydrate) {
		const c = sharedConfig.context;
		setHydrateContext(nextHydrateContext());
		const r = Comp(props || {});
		setHydrateContext(c);
		return r;
	}
	return Comp(props || {});
}
function splitProps(props, ...keys) {
	const descriptors = Object.getOwnPropertyDescriptors(props), split = (k) => {
		const clone = {};
		for (let i = 0; i < k.length; i++) {
			const key = k[i];
			if (descriptors[key]) {
				Object.defineProperty(clone, key, descriptors[key]);
				delete descriptors[key];
			}
		}
		return clone;
	};
	return keys.map(split).concat(split(Object.keys(descriptors)));
}
createContext();
//#endregion
//#region ../../node_modules/.pnpm/seroval@1.5.4/node_modules/seroval/dist/esm/production/index.mjs
var M = ((i) => (i[i.AggregateError = 1] = "AggregateError", i[i.ArrowFunction = 2] = "ArrowFunction", i[i.ErrorPrototypeStack = 4] = "ErrorPrototypeStack", i[i.ObjectAssign = 8] = "ObjectAssign", i[i.BigIntTypedArray = 16] = "BigIntTypedArray", i[i.RegExp = 32] = "RegExp", i))(M || {}), o$1 = void 0;
Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY;
function c$1(e, r, t, n, a, s, i, u, l, g, S, d) {
	return {
		t: e,
		i: r,
		s: t,
		c: n,
		m: a,
		p: s,
		e: i,
		a: u,
		f: l,
		b: g,
		o: S,
		l: d
	};
}
function B$1(e) {
	return c$1(2, o$1, e, o$1, o$1, o$1, o$1, o$1, o$1, o$1, o$1, o$1);
}
B$1(2);
B$1(3);
B$1(1);
B$1(0);
B$1(4);
B$1(5);
B$1(6);
B$1(7);
var L$1 = "__SEROVAL_REFS__", U = /* @__PURE__ */ new Map();
typeof globalThis != "undefined" ? Object.defineProperty(globalThis, L$1, {
	value: U,
	configurable: !0,
	writable: !1,
	enumerable: !1
}) : typeof window != "undefined" ? Object.defineProperty(window, L$1, {
	value: U,
	configurable: !0,
	writable: !1,
	enumerable: !1
}) : typeof self != "undefined" ? Object.defineProperty(self, L$1, {
	value: U,
	configurable: !0,
	writable: !1,
	enumerable: !1
}) : typeof global != "undefined" && Object.defineProperty(global, L$1, {
	value: U,
	configurable: !0,
	writable: !1,
	enumerable: !1
});
var { toString: bs } = Object.prototype, ee = () => {
	let e = {
		p: 0,
		s: 0,
		f: 0
	};
	return e.p = new Promise((r, t) => {
		e.s = r, e.f = t;
	}), e;
}, An = (e, r) => {
	e.s(r), e.p.s = 1, e.p.v = r;
}, En = (e, r) => {
	e.f(r), e.p.s = 2, e.p.v = r;
};
ee.toString();
An.toString();
En.toString();
var Pr = () => {
	let e = [], r = [], t = !0, n = !1, a = 0, s = (l, g, S) => {
		for (S = 0; S < a; S++) r[S] && r[S][g](l);
	}, i = (l, g, S, d) => {
		for (g = 0, S = e.length; g < S; g++) d = e[g], !t && g === S - 1 ? l[n ? "return" : "throw"](d) : l.next(d);
	}, u = (l, g) => (t && (g = a++, r[g] = l), i(l), () => {
		t && (r[g] = r[a], r[a--] = void 0);
	});
	return {
		__SEROVAL_STREAM__: !0,
		on: (l) => u(l),
		next: (l) => {
			t && (e.push(l), s(l, "next"));
		},
		throw: (l) => {
			t && (e.push(l), s(l, "throw"), t = !1, n = !1, r.length = 0);
		},
		return: (l) => {
			t && (e.push(l), s(l, "return"), t = !1, n = !0, r.length = 0);
		}
	};
};
Pr.toString();
var xr = (e) => (r) => () => {
	let t = 0, n = {
		[e]: () => n,
		next: () => {
			if (t > r.d) return {
				done: !0,
				value: void 0
			};
			let a = t++, s = r.v[a];
			if (a === r.t) throw s;
			return {
				done: a === r.d,
				value: s
			};
		}
	};
	return n;
};
xr.toString();
var Tr = (e, r) => (t) => () => {
	let n = 0, a = -1, s = !1, i = [], u = [], l = (S = 0, d = u.length) => {
		for (; S < d; S++) u[S].s({
			done: !0,
			value: void 0
		});
	};
	t.on({
		next: (S) => {
			let d = u.shift();
			d && d.s({
				done: !1,
				value: S
			}), i.push(S);
		},
		throw: (S) => {
			let d = u.shift();
			d && d.f(S), l(), a = i.length, s = !0, i.push(S);
		},
		return: (S) => {
			let d = u.shift();
			d && d.s({
				done: !0,
				value: S
			}), l(), a = i.length, i.push(S);
		}
	});
	let g = {
		[e]: () => g,
		next: () => {
			if (a === -1) {
				let G = n++;
				if (G >= i.length) {
					let rt = r();
					return u.push(rt), rt.p;
				}
				return {
					done: !1,
					value: i[G]
				};
			}
			if (n > a) return {
				done: !0,
				value: void 0
			};
			let S = n++, d = i[S];
			if (S !== a) return {
				done: !1,
				value: d
			};
			if (s) throw d;
			return {
				done: !0,
				value: d
			};
		}
	};
	return g;
};
Tr.toString();
var Or = (e) => {
	let r = atob(e), t = r.length, n = new Uint8Array(t);
	for (let a = 0; a < t; a++) n[a] = r.charCodeAt(a);
	return n.buffer;
};
Or.toString();
var oe = ((t) => (t[t.Vanilla = 1] = "Vanilla", t[t.Cross = 2] = "Cross", t))(oe || {});
var Ro = () => T, Po = Ro.toString();
/=>/.test(Po);
//#endregion
//#region ../../node_modules/.pnpm/solid-js@1.9.12/node_modules/solid-js/web/dist/server.js
const booleans = [
	"allowfullscreen",
	"async",
	"alpha",
	"autofocus",
	"autoplay",
	"checked",
	"controls",
	"default",
	"disabled",
	"formnovalidate",
	"hidden",
	"indeterminate",
	"inert",
	"ismap",
	"loop",
	"multiple",
	"muted",
	"nomodule",
	"novalidate",
	"open",
	"playsinline",
	"readonly",
	"required",
	"reversed",
	"seamless",
	"selected",
	"adauctionheaders",
	"browsingtopics",
	"credentialless",
	"defaultchecked",
	"defaultmuted",
	"defaultselected",
	"defer",
	"disablepictureinpicture",
	"disableremoteplayback",
	"preservespitch",
	"shadowrootclonable",
	"shadowrootcustomelementregistry",
	"shadowrootdelegatesfocus",
	"shadowrootserializable",
	"sharedstoragewritable"
];
const BooleanAttributes = /* @__PURE__ */ new Set(booleans);
[...booleans];
const ChildProperties = /* @__PURE__ */ new Set([
	"innerHTML",
	"textContent",
	"innerText",
	"children"
]);
const Aliases = /* @__PURE__ */ Object.assign(Object.create(null), {
	className: "class",
	htmlFor: "for"
});
M.AggregateError | M.BigIntTypedArray;
const VOID_ELEMENTS = /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i;
function ssrClassList(value) {
	if (!value) return "";
	let classKeys = Object.keys(value), result = "";
	for (let i = 0, len = classKeys.length; i < len; i++) {
		const key = classKeys[i], classValue = !!value[key];
		if (!key || key === "undefined" || !classValue) continue;
		i && (result += " ");
		result += escape(key);
	}
	return result;
}
function ssrStyle(value) {
	if (!value) return "";
	if (typeof value === "string") return escape(value, true);
	let result = "";
	const k = Object.keys(value);
	for (let i = 0; i < k.length; i++) {
		const s = k[i];
		const v = value[s];
		if (v != void 0) {
			if (i) result += ";";
			const r = escape(v, true);
			if (r != void 0 && r !== "undefined") result += `${s}:${r}`;
		}
	}
	return result;
}
function ssrElement(tag, props, children, needsId) {
	if (props == null) props = {};
	else if (typeof props === "function") props = props();
	const skipChildren = VOID_ELEMENTS.test(tag);
	const keys = Object.keys(props);
	let result = `<${tag}${needsId ? ssrHydrationKey() : ""} `;
	let classResolved;
	for (let i = 0; i < keys.length; i++) {
		const prop = keys[i];
		if (ChildProperties.has(prop)) {
			if (children === void 0 && !skipChildren) children = tag === "script" || tag === "style" || prop === "innerHTML" ? props[prop] : escape(props[prop]);
			continue;
		}
		const value = props[prop];
		if (prop === "style") result += `style="${ssrStyle(value)}"`;
		else if (prop === "class" || prop === "className" || prop === "classList") {
			if (classResolved) continue;
			let n;
			result += `class="${escape(((n = props.class) ? n + " " : "") + ((n = props.className) ? n + " " : ""), true) + ssrClassList(props.classList)}"`;
			classResolved = true;
		} else if (BooleanAttributes.has(prop)) if (value) result += prop;
		else continue;
		else if (value == void 0 || prop === "ref" || prop.slice(0, 2) === "on" || prop.slice(0, 5) === "prop:") continue;
		else if (prop.slice(0, 5) === "bool:") {
			if (!value) continue;
			result += escape(prop.slice(5));
		} else if (prop.slice(0, 5) === "attr:") result += `${escape(prop.slice(5))}="${escape(value, true)}"`;
		else result += `${Aliases[prop] || escape(prop)}="${escape(value, true)}"`;
		if (i !== keys.length - 1) result += " ";
	}
	if (skipChildren) return { t: result + "/>" };
	if (typeof children === "function") children = children();
	return { t: result + `>${resolveSSRNode(children, true)}</${tag}>` };
}
function ssrHydrationKey() {
	const hk = getHydrationKey();
	return hk ? ` data-hk="${hk}"` : "";
}
function escape(s, attr) {
	const t = typeof s;
	if (t !== "string") {
		if (!attr && t === "function") return escape(s());
		if (!attr && Array.isArray(s)) {
			s = s.slice();
			for (let i = 0; i < s.length; i++) s[i] = escape(s[i]);
			return s;
		}
		if (attr && t === "boolean") return String(s);
		return s;
	}
	const delim = attr ? "\"" : "<";
	const escDelim = attr ? "&quot;" : "&lt;";
	let iDelim = s.indexOf(delim);
	let iAmp = s.indexOf("&");
	if (iDelim < 0 && iAmp < 0) return s;
	let left = 0, out = "";
	while (iDelim >= 0 && iAmp >= 0) if (iDelim < iAmp) {
		if (left < iDelim) out += s.substring(left, iDelim);
		out += escDelim;
		left = iDelim + 1;
		iDelim = s.indexOf(delim, left);
	} else {
		if (left < iAmp) out += s.substring(left, iAmp);
		out += "&amp;";
		left = iAmp + 1;
		iAmp = s.indexOf("&", left);
	}
	if (iDelim >= 0) do {
		if (left < iDelim) out += s.substring(left, iDelim);
		out += escDelim;
		left = iDelim + 1;
		iDelim = s.indexOf(delim, left);
	} while (iDelim >= 0);
	else while (iAmp >= 0) {
		if (left < iAmp) out += s.substring(left, iAmp);
		out += "&amp;";
		left = iAmp + 1;
		iAmp = s.indexOf("&", left);
	}
	return left < s.length ? out + s.substring(left) : out;
}
function resolveSSRNode(node, top) {
	const t = typeof node;
	if (t === "string") return node;
	if (node == null || t === "boolean") return "";
	if (Array.isArray(node)) {
		let prev = {};
		let mapped = "";
		for (let i = 0, len = node.length; i < len; i++) {
			if (!top && typeof prev !== "object" && typeof node[i] !== "object") mapped += `<!--!$-->`;
			mapped += resolveSSRNode(prev = node[i]);
		}
		return mapped;
	}
	if (t === "object") return node.t;
	if (t === "function") return resolveSSRNode(node());
	return String(node);
}
function getHydrationKey() {
	const hydrate = sharedConfig.context;
	return hydrate && !hydrate.noHydrate && sharedConfig.getNextContextId();
}
function notSup() {
	throw new Error("Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.");
}
function createDynamic(component, props) {
	const comp = component(), t = typeof comp;
	if (comp) {
		if (t === "function") return comp(props);
		else if (t === "string") return ssrElement(comp, props, void 0, true);
	}
}
function Dynamic(props) {
	const [, others] = splitProps(props, ["component"]);
	return createDynamic(() => props.component, others);
}
//#endregion
//#region src/runtime.tsx
function renderMarkdownDocument(nodes, props = {}) {
	const components = props.components ?? {};
	const content = renderNodes(nodes, components);
	const Wrapper = components.wrapper;
	if (!Wrapper) return content;
	return createComponent(Dynamic, {
		component: Wrapper,
		get children() {
			return content;
		}
	});
}
function renderNodes(nodes, components) {
	return nodes.map((node) => renderNode(node, components));
}
function renderNode(node, components) {
	switch (node.type) {
		case "text": return node.value;
		case "html": return createComponent(Dynamic, {
			component: components.HtmlBlock ?? DefaultHtmlBlock,
			html: node.html
		});
		case "codeblock": return createComponent(Dynamic, {
			component: components.ShikiCodeBlock ?? components.CodeBlock ?? DefaultShikiCodeBlock,
			code: node.code,
			language: node.language,
			html: node.html,
			meta: node.meta,
			title: node.title
		});
		case "element": return createComponent(Dynamic, {
			component: components[node.tag] ?? node.tag,
			...node.attrs,
			get children() {
				return renderNodes(node.children, components);
			}
		});
	}
}
function DefaultHtmlBlock(props) {
	return notSup(props.html)();
}
function DefaultShikiCodeBlock(props) {
	return notSup(props.html)();
}
//#endregion
export { renderMarkdownDocument };
