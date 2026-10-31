# Football Betting Tips (FREE): Today & This Weekend

## Mission
Create implementation-ready, token-driven UI guidance for Football Betting Tips (FREE): Today & This Weekend that is optimized for consistency, accessibility, and fast delivery across dashboard web app.

## Brand
- Product/brand: Football Betting Tips (FREE): Today & This Weekend
- URL: https://www.olbg.com/betting-tips/Football/1
- Audience: authenticated users and operators
- Product surface: dashboard web app

## Style Foundations
- Visual style: structured, tokenized, content-first
- Main font style: `font.family.primary=Lato`, `font.family.stack=Lato, sans-serif`, `font.size.base=16px`, `font.weight.base=400`, `font.lineHeight.base=28px`
- Typography scale: `font.size.xs=11px`, `font.size.sm=11.04px`, `font.size.md=11.2px`, `font.size.lg=12.8px`, `font.size.xl=14px`, `font.size.2xl=15px`, `font.size.3xl=16px`, `font.size.4xl=18px`
- Color palette: `color.text.primary=#0d2938`, `color.text.secondary=#ffffff`, `color.text.tertiary=#8e99b1`, `color.text.inverse=#276687`, `color.surface.base=#000000`, `color.surface.muted=#e9f3f9`, `color.surface.strong=#ffc26f`, `color.border.default=#e5e7eb`, `color.border.strong=#6f4000`
- Spacing scale: `space.1=4.8px`, `space.2=6px`, `space.3=8px`, `space.4=12px`, `space.5=16px`, `space.6=24px`
- Radius/shadow/motion tokens: `radius.xs=4px`, `radius.sm=20px` | `shadow.1=rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
Concise, confident, implementation-focused.

## Rules: Do
- Use semantic tokens, not raw hex values, in component guidance.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure
- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Include known page component density: links (265), buttons (53), lists (43), cards (21), navigation (10), tables (7), inputs (4).


## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.
