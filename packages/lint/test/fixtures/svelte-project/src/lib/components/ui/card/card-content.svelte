<script lang="ts">
	import { cn } from "$lib/utils.js";

	let { class: className, children, ...restProps } = $props();
</script>

<div data-slot="card-content" class={cn("px-6", className)} {...restProps}>
	{@render children?.()}
</div>
