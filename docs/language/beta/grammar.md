# The beta grammar

The productions of the `.pdx` language in its beta form, in the W3C EBNF notation of
`docs/language/overview.md`. The other pages give each construct its semantics and rules; this page
is the grammar they share. A few productions local to one construct live on its page
(`ScopedStyle` and `ComponentToken` in styles.md, `StoreRune` in data.md, `DerivedDecl` in
script.md). A production marked
`(β #n)` is new or changed in the beta and names the issue that implements it; one marked
`(proposed — decisions.md n)` or `(†…)` is decided (decisions.md, point n) and not yet backed by an
issue; an unmarked production is the alpha one, unchanged.

A script is TypeScript: `Expression`, `Statement` and `Type` are TypeScript's, read by the TypeScript
grammar. CSS is CSS: `CssText` is read by the browser's grammar, plus the extensions below.

## Shared

```ebnf
Identifier     ::= [A-Za-z_$] [A-Za-z0-9_$]*
Word           ::= [A-Za-z0-9_]+
KebabName      ::= [a-z] [a-z0-9]* ( "-" [a-z0-9]+ )*
StringLiteral  ::= "'" [^']* "'" | '"' [^"]* '"'
Number         ::= "-"? [0-9]+ ( "." [0-9]+ )?
Digits         ::= [0-9]+
Expression     ::= /* a TypeScript expression */
Statement      ::= /* a TypeScript statement */
Type           ::= /* a TypeScript type */
TypeParameter  ::= /* a TypeScript type parameter: Identifier ( "extends" Type )? ( "=" Type )? */
ObjectLiteral  ::= /* a JSON value written as a JavaScript object literal */
S              ::= ( " " | "\t" | "\n" | "\r" )+
Paren          ::= "(" S? Expression S? ")"
End            ::= S? ";"?
/* A declaration may span lines when it opens a balanced { … } or ( … ) on its first line; it ends at
   its ";" or at the end of that block (proposed — decisions.md 11). */
```

## The file

```ebnf
PdxFile        ::= ( TemplateBlock | ScriptBlock | StyleBlock | S )*
TemplateBlock  ::= "<template" ( S "shadow" )? ( S "src=" StringLiteral S? "/>" | ">" Template "</template>" )
ScriptBlock    ::= "<script" ( S "setup" )? ( S 'lang="js"' )? ( S "src=" StringLiteral S? "/>" | ">" Script "</script>" )   (β #158: `setup` accepted and ignored; one mode)
StyleBlock     ::= "<style" ( S "scoped" )? ( S "src=" StringLiteral S? "/>" | ">" Css "</style>" )
ScriptOnlyFile ::= Script                                       /* a .pdx.ts file */
```

At most one `TemplateBlock` and one `ScriptBlock`; any number of `StyleBlock`s. In `beta`,
`<script setup>` is accepted and `setup` ignored (`PDX_SETUP_REDUNDANT`, info); the legacy script
mode does not exist (#158).

## The script

```ebnf
Script         ::= ( S? ScriptItem )* S?
ScriptItem     ::= Declaration | RuneStatement | Statement
Declaration    ::= ComponentDecl | RouteDecl | DataDecl | ModuleDecl

ComponentDecl  ::= PropDecl | ModelDecl | EventDecl | SlotDecl | GenericDecl | StateDecl | PartDecl
                 | HostDecl | ExposeDecl | ProvideDecl | InjectDecl | VariantsDecl | TagDecl
ModuleDecl     ::= UseDecl | SnippetDecl | I18nDecl | RawScriptBlock                                    († `@mixin` removed — decisions.md 6)
RouteDecl      ::= PageDecl | GuardDecl | LoaderDecl | LayoutDecl | OutletDecl | ScrollDecl | RedirectDecl
                 | ParamsDecl | SearchDecl | TitleDecl | MetaDecl
                 /* † removed: @route, @alias, @prefetch, the script @transition, @head — decisions.md 1, 2, 3, 7, 19 (landed #277) */
DataDecl       ::= FetchDecl | ActionDecl | FormDecl | StoreDecl
```

### Component declarations

```ebnf
PropDecl       ::= "@prop" S Identifier "?"? S? ":" S? Type ( S? "=" S? Expression )? End          (β #130: `?`; no default = required)
ModelDecl      ::= "@model" S Identifier S? ":" S? Type ( S? "=" S? Expression )? ( S? ModelOptions )? End   (β #124, #135)
ModelOptions   ::= "{" S? "form" S? "}"
EventDecl      ::= "@event" ( "(" S? "bubbles" S? ")" )? S Identifier ( S? ":" S? Type )? End      (β #138: `(bubbles)`)
SlotDecl       ::= "@slot" S Identifier "?"? ( S? ":" S? SlotSignature )? End                     (β #131: a signature)
SlotSignature  ::= "(" S? ( SlotParam ( S? "," S? SlotParam )* )? S? ")"
SlotParam      ::= Identifier S? ":" S? Type
GenericDecl    ::= "@generic" S TypeParameter ( S? "," S? TypeParameter )* End                    (β #131)
StateDecl      ::= "@state" S Identifier S? "=" S? Expression End                                   (β #132)
PartDecl       ::= "@part" S Identifier ( S? "," S? Identifier )* End                               (β #134)
HostDecl       ::= "@host" S? "{" ( S? Attribute )* S? "}"                                          (β #133: the template's attribute grammar)
ExposeDecl     ::= "@expose" S Identifier ( S? "," S? Identifier )* End
ProvideDecl    ::= "@provide" S Identifier S? "=" S? Expression End                                  (β #139: Identifier is a token)
InjectDecl     ::= "@inject" S Identifier S "from" S Identifier ( S? "=" S? Expression )? End         (β #139)
VariantsDecl   ::= "@variants" S? "{" ( S? VariantAxis )+ S? "}"                                    (β #153)
VariantAxis    ::= Identifier S? ":" S? "{" S? Word ( S? "," S? Word )* S? "}" ( S? "=" S? Word )? S? ";"
TagDecl        ::= "@tag" S StringLiteral End
```

### Module declarations

```ebnf
UseDecl        ::= "@use" S "'" [^']+ "'" S "from" S "'" [^']+ "'" End
SnippetDecl    ::= "@snippet" S Identifier S? "(" S? SnippetParams? S? ")" S? "{" Template "}"       (the body is a Template — decisions.md 9, landed #489)
SnippetParams  ::= SnippetParam ( S? "," S? SnippetParam )*
SnippetParam   ::= Identifier ( S? ":" S? Type )?
I18nDecl       ::= "@i18n" S? "{" S? I18nOption ( S? ( "," | ";" ) S? I18nOption )* S? ( "," | ";" )? S? "}"
I18nOption     ::= "locales" S? ":" S? "[" StringLiteral ( S? "," S? StringLiteral )* S? "]"
                 | "default" S? ":" S? StringLiteral
                 | "translations" S? ":" S? StringLiteral
                 | "detect" S? ":" S? ( "true" | "false" )
                 | "persist" S? ":" S? ( "true" | "false" | "'session'" )
RawScriptBlock ::= "@raw" S? "{" /* TypeScript statements, as written */ "}"
```

### Runes

```ebnf
RuneStatement  ::= RuneDecl | EffectCall | WatchCall
RuneDecl       ::= ( "let" | "const" | "var" ) S RuneBinding ( S? "," S? ( RuneBinding | Binding ) )* End
RuneBinding    ::= Identifier S? ( ":" S? Type S? )? "=" S? Rune S? ( "<" Type ">" )? "(" Expression? ")"   /* only $signal may omit it (#186, landed) */
Rune           ::= "$signal" | "$derived" | "$store"
Binding        ::= Identifier ( S? "=" S? Expression )?
EffectCall     ::= "$effect" S? "(" S? Expression S? ")" End
WatchCall      ::= "$watch" S? "(" S? Expression S? "," S? Expression ( S? "," S? Expression )? S? ")" End
I18nCall       ::= ( "$t" | "$n" | "$d" | "$r" ) S? "(" S? Expression ( S? "," S? Expression )? S? ")"
```

`$emit` is not part of the beta (#138).

### Route declarations

```ebnf
Path           ::= "'/" [^']* "'" | '"/' [^"]* '"'     /* the shape PDX_PAGE_INVALID_PATH enforces */
PathSegment    ::= "/" ( Word | ":" Identifier ( "(" Constraint ")" )? | "*" )
Constraint     ::= "string" | "number" | "uuid" | "slug"
PageDecl       ::= "@page" S StringLiteral ( S? "," S? StringLiteral )* ( S? PageOptions )? End     /* each StringLiteral is a Path */
PageOptions    ::= "{" S? PageOption ( S? "," S? PageOption )* S? "}"
PageOption     ::= "keepAlive" ( S? ":" S? ( "true" | "false" | Digits ) )?                             /* Digits: a timeout in ms */
                 | "preload" ( S? ":" S? ( "true" | "false" ) )?
                 | "prefetch" S? ":" S? ( "'hover'" | "'eager'" | "'viewport'" | "'never'" )
                 | "label" S? ":" S? ( StringLiteral | Identifier | "$t(" S? StringLiteral S? ")" )
                 | "transition" S? ":" S? StringLiteral                                                († decisions.md 7, landed #277)
                 | "meta" S? ":" S? ObjectLiteral                                                      († decisions.md 8, landed #277)
GuardDecl      ::= "@guard" S StringLiteral End
LoaderDecl     ::= "@loader" S Identifier S? ":" S? Identifier ( S? LoaderOptions )? End              (β #146, #148)
LoaderOptions  ::= "{" S? "staleTime" S? ":" S? Expression S? "}"
LayoutDecl     ::= "@layout" S StringLiteral End
OutletDecl     ::= "@outlet" S ( "'" Word "'" | '"' Word '"' ) S? "->" S? StringLiteral End
ScrollDecl     ::= "@scroll" S ( "'top'" | "'preserve'" | '"top"' | '"preserve"' ) End
RedirectDecl   ::= "@redirect" S StringLiteral ( S? "->" S? StringLiteral )? End
ParamsDecl     ::= "@params" S? "{" S? ParamField ( S? "," S? ParamField )* S? "}" End
ParamField     ::= Identifier S? ":" S? Identifier
SearchDecl     ::= "@search" S? "{" S? SearchField ( S? "," S? SearchField )* S? "}" End
SearchField    ::= Identifier "?"? S? ":" S? ( "string" | "number" | "boolean" ) ( S? "=" S? Expression )?
TitleDecl      ::= "@title" S Expression End
MetaDecl       ::= "@meta" S ( "property" S )? [A-Za-z0-9_:-]+ S? ":" S? StringLiteral End              (head tags only — decisions.md 8)
```

### Data declarations

```ebnf
FetchDecl      ::= "@fetch" S Word S? ":" S? FetchSpec ( S "as" S Type )? ( S? FetchOptions )? End
FetchSpec      ::= Quote Method " " Url Quote
Method         ::= [A-Za-z]+                         /* any case; anything but GET is PDX_FETCH_METHOD */
Quote          ::= "'" | '"' | "`"
Url            ::= ( UrlChar | "${" Expression "}" )+
UrlChar        ::= /* any character but the Quote that opened the spec */
FetchOptions   ::= "{" S? FetchOption ( S? "," S? FetchOption )* ( S? "," )? S? "}"
FetchOption    ::= ( "key" | "staleTime" | "retry" | "tags" | "enabled" | "transform"
                   | "onSuccess" | "onError" | "cache" | "stale" ) ( S? ":" S? Expression )?
ActionDecl     ::= "@action" S Identifier S? "(" S? ActionParams? S? ")"                               (β #142)
                   ( S "when" S Expression )? ( S "with" S? ActionOptions )? S? "{" Statement* "}"
ActionParams   ::= Identifier ( S? ":" S? Type )? ( S? "," S? "{" S? "signal" S? "}" )?
                 | "{" S? "signal" S? "}"
ActionOptions  ::= "{" S? ActionOption ( S? "," S? ActionOption )* ( S? "," )? S? "}"
ActionOption   ::= ( "invalidate" | "optimistic" | "onSuccess" | "onError" ) S? ":" S? Expression
                 | "concurrency" S? ":" S? Quote ( "queue" | "drop" | "coalesce" | "parallel" ) Quote      (proposed — decisions.md 24)
                 | "agent" S? ":" S? StringLiteral | "consequential" S? ":" S? ( "true" | "false" )             (proposed — decisions.md 31)
FormDecl       ::= "@form" S Word S? ":" S? ( InlineSchema | Word ) ( S? FormOptions )? End
InlineSchema   ::= "{" S? Field ( S? "," S? Field )* ( S? "," )? S? "}"
Field          ::= ScalarField | ObjectField | RowsField
ScalarField    ::= Word S? "?"? S? ":" S? FieldType ( S? Rules )?
ObjectField    ::= Word S? "?"? S? ":" S? "{" S? ScalarField ( S? "," S? ScalarField )* S? "}"
RowsField      ::= Word S? "?"? S? ":" S? "[" S? "{" S? ScalarField ( S? "," S? ScalarField )* S? "}" S? "]"
FieldType      ::= [A-Za-z0-9_|'"]+ "[]"?
Rules          ::= "{" S? Rule ( S? "," S? Rule )* S? "}"
Rule           ::= "required" | Word ( S? ":" S? [^,}]+ )?
FormOptions    ::= "{" S? FormOption ( S? ( ";" | "\n" ) S? FormOption )* S? ";"? S? "}"
FormOption     ::= ( "save" | "saveMode" ) S? ":" S? StringLiteral
                 | "warnUnsaved" ( S? ":" S? ( "true" | "false" ) )?
                 | ( "validate" | "source" | "parent" ) S? ":" S? Expression
                 | "fields" S? ":" S? "{" ( Word S? ":" S? "{" FieldSave ( "," FieldSave )* "}" ","? )* "}"
FieldSave      ::= S? ( ( "save" | "saveMode" ) S? ":" S? StringLiteral | "saveDebounce" S? ":" S? Digits ) S?
StoreDecl      ::= "@store" S Word ( S? "{" S? "persist" S? ":" S? ( "'" Word "'" | '"' Word '"' ) S? "}" )? End   († only 'local' | 'session' — decisions.md 14)
```

## The template

```ebnf
Template       ::= ( Text | Comment | AtEscape | Element | Interpolation | Directive )*
Text           ::= /* any character run that starts none of the others */
Comment        ::= "<!--" /* any text */ "-->"
AtEscape       ::= "@@"
Element        ::= "<" ElementName ( S Attribute )* S? ( "/>" | ">" ElementContent "</" ElementName S? ">" )
                 | DynamicComponent | SlotOutlet
ElementContent ::= ( Template | SnippetFill )*                                                          (β #131)
ElementName    ::= [A-Za-z] [A-Za-z0-9-]*
Block          ::= S? "{" Template "}"
```

### Text

```ebnf
Interpolation  ::= "{{" S? Expression ( S? Pipe )* S? "}}"
Pipe           ::= "|" S? Identifier ( "(" Expression ( S? "," S? Expression )* ")" )?                  (β #129: a single pipe is PDX_PIPE_SINGLE, info — decisions.md 4)
```

### Attributes

```ebnf
Attribute      ::= PlainAttribute | PropBinding | OnceBinding | ClassBinding | StyleBinding
                 | TwoWayBinding | GroupBinding | EventBinding | RefBinding | GestureBinding
                 | AttachBinding | PartAttribute | GenericArgument
PlainAttribute ::= AttrName ( "=" ( AttrValue | [^"'=<>`#x20#x9#xA]+ ) )?
AttrName       ::= [A-Za-z_] [A-Za-z0-9_:.-]*
AttrValue      ::= '"' [^"]* '"' | "'" [^']* "'"
BoundName      ::= [A-Za-z_] [A-Za-z0-9_-]*

PropBinding    ::= ":" BoundName ( "=" AttrValue )?
OnceBinding    ::= ":" BoundName ".once" "=" AttrValue                                                 (β #126)
ClassBinding   ::= ":class" "=" AttrValue                                                              (β #129: object or string; no `:class.x`)
StyleBinding   ::= ":style" "=" AttrValue                                                             (β #129: `:style.prop` removed — decisions.md 5)
TwoWayBinding  ::= "::" BoundName ( "." TwoWayModifier )* "=" AttrValue                                (β #124, #126)
TwoWayModifier ::= "lazy" | "trim" | "number" | "debounce(" Digits ")"
GroupBinding   ::= "::group" "=" AttrValue                                                             (β #127)
EventBinding   ::= "@" EventName ( "." EventModifier )* "=" AttrValue
EventName      ::= [A-Za-z_] [A-Za-z0-9_-]*
EventModifier  ::= "prevent" | "stop" | "self" | "once" | "capture" | "passive" | KeyFilter
KeyFilter      ::= "enter" | "escape" | "space" | "tab" | "delete" | "up" | "down" | "left" | "right"
RefBinding     ::= ":ref" "=" AttrValue                                                                (β #129: no `ref=`)
GestureBinding ::= "@swipe." ( "left" | "right" | "up" | "down" ) "=" AttrValue
                 | ( "@longpress" | "@pinch" ) "=" AttrValue
AttachBinding  ::= "attach:" Identifier ( "=" AttrValue )?                                             (β #143)
PartAttribute  ::= 'data-part="' Identifier '"'                                                        (β #134)
GenericArgument ::= Identifier "=" AttrValue      /* on a generic component: T="User" */               (β #131)
```

A two-way value is a signal name, a form field (`f.email`), or the general form:

```ebnf
TwoWayValue    ::= Identifier ( "." Identifier )*
                 | "{" S? "get" S? ":" S? Expression S? "," S? "set" S? ":" S? Expression S? "}"       (β #126)
```

`:show` (attribute) is not part of the beta (#129); `@show { }` is.

### Components and snippets

```ebnf
DynamicComponent ::= "<component" S ":is=" AttrValue ( S DynamicOption )* S? ( "/>" | ">" )
DynamicOption    ::= PropBinding | "@keepAlive" ( S? "(" S? Digits S? ")" )? | "keep-alive"               (proposed: the maximum — decisions.md 28)
                   | "@transition" S? "(" StringLiteral ( S? "," S? StringLiteral )? ")"
                   | "@mode" S? "(" StringLiteral ")"
SlotOutlet       ::= "<slot" ( S "name=" AttrValue )? S? ( "/>" | ">" Template "</slot>" )             (β #131: no `:x` scope, no `let:`)
SnippetFill      ::= "@snippet" S Identifier S? "(" S? ( Identifier ( S? "," S? Identifier )* )? S? ")" Block   (β #131)
RenderDirective  ::= "@render" S Identifier "?."? S? "(" S? ( Expression ( S? "," S? Expression )* )? S? ")"  (β #131)
                     ( S? "@else" Block )?          /* fallback of an optional slot (decisions.md 22 — landed, #489) */
```

### Block directives

```ebnf
Directive      ::= IfBlock | ForBlock | SwitchBlock | RequireBlock | ShowBlock | PortalBlock
                 | DeferBlock | AwaitBlock | TryBlock | LetDecl | RenderDirective | RawBlock
IfBlock        ::= "@if" S? Paren S? BlockTransition? Block
                   ( S? "@else" S? ( ( "@if" | "if" ) S? Paren S? BlockTransition? Block | Block ) )*
ForBlock       ::= "@for" S? "(" S? Expression S "as" S ForBinding ( S? "," S? Identifier )? S? ";" S? "track" S Expression S? ")"
                   S? BlockTransition? ( S? "@virtual" ( S? "(" S? Number S? ")" )? )? Block ( S? "@empty" Block )?   (proposed: @virtual — decisions.md 29)
ForBinding     ::= Identifier | /* an object or array destructuring pattern */
BlockTransition ::= "@transition" S? "(" TName ( S? "," S? TName )? ")" ( S? "@stagger" S? "(" Number ")" )?
                    ( S? "@mode" S? "(" TName ")" )? ( S? Move )?
                  | Move
Move           ::= "@move" S? "(" Number? ")"
TName          ::= StringLiteral | [A-Za-z0-9_-]+
SwitchBlock    ::= "@switch" S? Paren S? "{" ( S? CaseClause )* ( S? "@default" Block )? ( S? CaseClause )* S? "}"
CaseClause     ::= "@case" S? "(" ( StringLiteral | [^)]+ ) ")" Block
RequireBlock   ::= "@require" S? "(" ( StringLiteral | [^)]+ ) ")" Block ( S? "@else" Block )?
ShowBlock      ::= "@show" S? Paren Block
PortalBlock    ::= "@portal" S? "(" ( StringLiteral | [^)]+ ) ")" Block
DeferBlock     ::= "@defer" S? "(" Triggers ( S? ";" S? "prefetch" S Triggers )? ")" Block                 ("; prefetch" — decisions.md 27, landed #281)
                   ( S? ( "@placeholder" Block | "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*     (ErrorNames — decisions.md 10, landed #281)
Triggers       ::= Trigger ( S? "|" S? Trigger )*
Trigger        ::= "viewport" | "idle" ( "(" Digits ")" )? | "interaction" | "timer(" Digits ")" | "immediate"   /* † `hover` removed — decisions.md 37, landed #281 */
                 | "when" S? "(" S? Expression S? ")"                                                      (decisions.md 27, landed #281)
AwaitBlock     ::= "@await" S? "(" S? Expression ( S "as" S Identifier )? S? ")" S? AwaitTiming? Block       (β #145: `as`; disambiguation proposed — decisions.md 18)
                   ( S? ( "@loading" Block | "@error" ( S? ErrorNames )? Block ) )*
AwaitTiming    ::= "{" S? TimingOption ( S? "," S? TimingOption )? S? "}"
TimingOption   ::= ( "minMs" | "maxMs" ) S? ":" S? Digits
ErrorNames     ::= "(" S? Identifier ( S? "," S? Identifier )? S? ")"
TryBlock       ::= "@try" Block S? "@catch" S? ErrorNames Block
LetDecl        ::= "@let" S Identifier S? "=" S? Expression ";"
RawBlock       ::= "@raw" S? "{" /* any text with balanced braces */ "}"
```

## Styles

```ebnf
Css            ::= ( CssText | ResponsiveCall | BindCall | VariantRule )*
CssText        ::= /* CSS, as the browser reads it */
ResponsiveCall ::= "responsive(" S? Length S? "," S? Length S? ( "," S? Number S? "," S? Number S? )? ")"
Length         ::= Number ( "px" | "rem" | "em" )
BindCall       ::= "bind(" S? Word S? ")"
VariantRule    ::= "@variant" S VariantTest ( S "and" S VariantTest )* S? "{" CssText "}"            (β #153)
VariantTest    ::= Identifier "(" Word ")"
```

In a theme file of `@pdxui/design` (not in a `.pdx`), the design build also reads:

```ebnf
ThemeBlock     ::= "@pdx-theme" S KebabName S? "{" CssText "}"                                           (β #155)
```

## The configuration

```ebnf
PdxOptions     ::= "pdx(" "{" ( PdxOption ( "," PdxOption )* )? "}" ")"
PdxOption      ::= "target" ":" ( "'baseline-2026'" | "'baseline-2024'" )                               (β #121)
                 | "prefix" ":" StringLiteral                                                           (β #136)
                 | /* the alpha options, minus inlineBindings (β #107) */
```

`pdx({ inlineBindings })` is not part of the beta: there is one render path (#107).
