<script lang="ts">
	import { cn } from "$lib/utils.js";

	let { class: className, children, ...restProps } = $props();
</script>

<div data-slot="card" class={cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6", className)} {...restProps}>
	{@render children?.()}
</div>
