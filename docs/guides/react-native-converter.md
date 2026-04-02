# React Native Converter Workflow Guide

The pipeline generates React Native (Expo) components from any design source (Figma, Canva, or screenshots/URLs). This guide covers the React Native-specific details of the conversion process. For general multi-framework pipeline information, see [docs/multi-framework/README.md](../multi-framework/README.md).

## When React Native Is Selected

React Native output is activated in one of two ways:

1. **Explicit selection** -- set `"outputTarget": "react-native"` in `build-spec.json` during the intake phase.
2. **Auto-detection** -- the pipeline detects `app.json` with an Expo config or `react-native` in the project's `package.json` dependencies and sets the target automatically.

The intake skills (`figma-intake`, `canva-intake`, `screenshot-intake`) ask the user to confirm or override the detected target during the interview.

## The `react-native-converter` Agent

The `react-native-converter` agent (defined in `.claude/agents/react-native-converter.md`) is dispatched during Phase 4 (Build) of the pipeline. It reads:

- **`build-spec.json`** -- component list, layout hierarchy, and page structure
- **`design-tokens.lock.json`** -- the single source of truth for all design values
- **Screenshots** -- used for layout decisions only; token values always come from the lockfile

The agent maps web design patterns to native equivalents. Grid layouts become flex-based `View` hierarchies, HTML elements become native primitives, and CSS properties translate to React Native style props or NativeWind classes. It generates components in dependency order (leaf components first, then composites), runs tests after each batch, and tracks progress via TodoWrite.

## NativeWind Setup

NativeWind brings Tailwind CSS to React Native via the `className` prop, making the styling experience nearly identical to web React. Design tokens from `design-tokens.lock.json` map directly to the NativeWind Tailwind config, so classes like `bg-primary`, `text-foreground`, and `rounded-lg` resolve to the locked design values.

NativeWind requires:

- The `nativewind` package and its Babel plugin in `babel.config.js`
- The `nativewind/metro` resolver in `metro.config.js`
- A `tailwind.config.ts` with content paths pointing to your `.tsx` files

The `templates/expo/` starter has all of this pre-configured.

## Component Patterns Generated

Every component is a `.tsx` file using React Native primitives and NativeWind classes:

```tsx
import { View, Text, Pressable } from 'react-native';

interface CardProps {
  title: string;
  onPress?: () => void;
  children: React.ReactNode;
}

export function Card({ title, onPress, children }: CardProps) {
  return (
    <View className="rounded-lg bg-surface p-4">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {children}
      {onPress && (
        <Pressable onPress={onPress} className="mt-2 rounded-md bg-primary px-4 py-2">
          <Text className="text-center font-medium text-white">Action</Text>
        </Pressable>
      )}
    </View>
  );
}
```

### Key patterns

- **Native primitives** -- `View`, `Text`, `Image`, `Pressable`, `ScrollView`, `FlatList`. No HTML elements (`div`, `span`, `button`, `img` are not available).
- **NativeWind `className`** -- Tailwind utility classes applied via the `className` prop, just like web React.
- **TypeScript interfaces** -- every component exports a props interface.
- **Platform-specific code** -- `Platform.OS` checks where iOS and Android behavior differs (shadows, status bar, safe areas).

## Key Differences from Web React

| Web React | React Native |
|-----------|-------------|
| `<div>` | `<View>` |
| `<span>`, `<p>` | `<Text>` |
| `<img>` | `<Image>` |
| `<button>` | `<Pressable>` |
| `onClick` | `onPress` |
| CSS Grid | Flexbox only (default column direction) |
| `@media` queries | `useWindowDimensions` or NativeWind responsive classes |
| `box-shadow` | `shadowColor`/`elevation` (platform-specific) |
| `overflow: scroll` | `<ScrollView>` or `<FlatList>` |
| `cursor: pointer` | N/A (touch is default) |
| `cn()` utility | `cn()` works with NativeWind (same API) |
| `children` prop | `children` prop (same) |

Flexbox defaults also differ: React Native uses `flexDirection: 'column'` by default (web uses `row`). NativeWind normalizes this in most cases, but be aware of it when debugging layouts.

## Navigation

Expo Router provides file-based routing similar to Next.js. Pages live in the `app/` directory:

| File | Route |
|------|-------|
| `app/index.tsx` | `/` (home screen) |
| `app/about.tsx` | `/about` |
| `app/(tabs)/home.tsx` | `/home` (tab navigator) |
| `app/(tabs)/settings.tsx` | `/settings` (tab navigator) |
| `app/_layout.tsx` | Root layout (wraps all screens) |
| `app/(tabs)/_layout.tsx` | Tab layout (configures tab bar) |

Layouts (`_layout.tsx`) define navigation structure -- stack navigators, tab bars, and drawers. The `react-native-converter` agent generates route files and layouts matching the page structure from `build-spec.json`.

## Testing

React Native components are tested with **Jest + @testing-library/react-native**. Test files use the `.test.tsx` extension.

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Card } from './Card';

test('renders title', () => {
  render(<Card title="Hello">{null}</Card>);
  expect(screen.getByText('Hello')).toBeTruthy();
});

test('calls onPress handler', () => {
  const onPress = jest.fn();
  render(<Card title="Hello" onPress={onPress}>{null}</Card>);
  fireEvent.press(screen.getByText('Action'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
```

Key testing patterns:

- `render()` renders a component with props and children
- `screen.getByText()` and `screen.getByTestId()` locate elements
- `fireEvent.press()` simulates touch interactions (not `click`)
- Jest is used instead of Vitest because React Native's transformer pipeline requires it

## E2E Testing

Playwright does not run on mobile simulators. For React Native targets, the pipeline skips the Playwright-based E2E phase and instead suggests one of:

- **Detox** -- Wix's gray-box testing framework for React Native. Runs on iOS Simulator and Android Emulator with native driver support.
- **Maestro** -- declarative mobile UI testing with YAML flows. No code required, supports both platforms.

The `e2e-test-generator` skill detects the `react-native` output target and generates a Detox or Maestro test scaffold rather than Playwright specs.

## Template Files

The `templates/expo/` directory provides starter configs for new Expo projects:

| File | Purpose |
|------|---------|
| `app.json` | Expo configuration (app name, SDK version, plugins) |
| `tsconfig.json` | TypeScript config for React Native + Expo |
| `babel.config.js` | Babel config with NativeWind plugin |
| `metro.config.js` | Metro bundler config with NativeWind resolver |
| `tailwind.config.ts` | NativeWind Tailwind config with design token structure |
| `jest.config.ts` | Jest config with React Native preset |
| `package.json` | Dependencies for Expo, NativeWind, Jest, TypeScript |

## Pipeline Differences for React Native

Several pipeline phases behave differently when the output target is `react-native`:

| Phase | Behavior |
|-------|----------|
| [3] TDD | Generates Jest tests instead of Vitest |
| [4] Build | Dispatches to `react-native-converter` agent |
| [4.5] Storybook | Skipped (or uses React Native Storybook if configured) |
| [5] Visual Diff | Compares simulator screenshots |
| [6] E2E Tests | Generates Detox/Maestro scaffold instead of Playwright |
| [7] Cross-Browser | Skipped (tested on iOS/Android simulators instead) |
| [8] Quality Gate | Coverage + types + build; Lighthouse is skipped (not a web page) |
| [8.5] Responsive | Uses device sizes (iPhone SE, iPhone 15, iPad) instead of viewport breakpoints |

All other phases (Token Sync, Intake, Token Lock, Dark Mode, Report) are shared and work identically to the web pipeline.

## Related Documentation

- [Multi-Framework Output](../multi-framework/README.md) -- pipeline dispatch details and framework auto-detection
- [Design Tokens Guide](design-tokens.md) -- how tokens are extracted, locked, and enforced
- [Visual QA Guide](visual-qa.md) -- pixel-diff verification (shared across all targets)
- `templates/expo/` -- starter configs for Expo + NativeWind + Jest
- `.claude/agents/react-native-converter.md` -- full agent definition
