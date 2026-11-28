---
name: shadcn-lint
description: Set up @shadcn/lint or fix its findings while preserving a project's design-system rules, intended appearance, and interaction states.
---

# Work with @shadcn/lint

For setup only, follow [SETUP.md](https://github.com/shadcn-ui/lint/blob/main/SETUP.md). Register the plugin with the existing linter without choosing or enabling new rules for the project.

## Fix existing findings

1. Run the project's actual UI lint command. Identify the rule, the element that receives the class or style, and any contract it has. Check the component definition, the theme loaded by lint, and existing examples in the project.
2. Preserve the visual intent and interaction states. Before replacing a class, identify what it does at the relevant breakpoint or state, especially focus, disabled, selected, and error feedback.
3. Prefer the component's supported variant or size for appearance changes, the project's semantic tokens for colors, and allowed layout utilities on the right container. Use static class alternatives where the intended values are finite. Keep a genuinely dynamic value in the project's approved API for that use.
4. If no supported change preserves the design, stop and explain the missing variant, token, or exception. Get approval before changing shared rules or contracts. Do not suppress the finding, disguise the same disallowed styling, or remove useful feedback just to make lint pass.
5. Rerun lint for the changed files and review the full diff. For visible behavior changes, compare the affected states in the running app or say which states could not be checked. Report remaining findings instead of implying the whole project is clean.

For example, when a raw focus color is reported on a button, use its existing focus treatment or the project's approved focus token. Do not remove the focus indicator. If neither meets the intended design, flag the missing token or variant rather than relaxing the rule.

See the [rules and examples](https://github.com/shadcn-ui/lint/blob/main/README.md#rules) for the meaning of a specific diagnostic.
