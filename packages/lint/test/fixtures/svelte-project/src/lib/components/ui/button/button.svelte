<script lang="ts" module>
	import { cn } from "$lib/utils.js";
	import { type VariantProps, tv } from "tailwind-variants";

	export const buttonVariants = tv({
		base: "inline-flex items-center justify-center rounded-md text-sm font-medium",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				outline: "border bg-background",
				link: "text-primary underline-offset-4",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 px-3",
				lg: "h-10 px-6",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		children,
		...restProps
	} = $props();
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {...restProps}>
	{@render children?.()}
</button>
