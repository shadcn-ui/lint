<script lang="ts">
	import { cn } from "$lib/utils.js";

	let { class: className, children, ...restProps } = $props();
</script>

<div data-slot="card-title" class={cn("leading-none font-semibold", className)} {...restProps}>
	{@render children?.()}
</div>
