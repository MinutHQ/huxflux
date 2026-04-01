import { Callout } from "fumadocs-ui/components/callout"
import { Steps, Step } from "fumadocs-ui/components/steps"
import defaultComponents from "fumadocs-ui/mdx"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMDXComponents(components: Record<string, any>): Record<string, any> {
  return {
    ...defaultComponents,
    ...components,
    Callout,
    Steps,
    Step,
  }
}
