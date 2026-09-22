<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	let { class: className, children, ...restProps } = $props();
</script>

<Button class={cn("gap-2", className)} {...restProps}>
	{@render children?.()}
</Button>
