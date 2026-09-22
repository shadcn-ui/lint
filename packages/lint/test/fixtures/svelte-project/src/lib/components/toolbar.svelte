<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let { class: className, children } = $props();
</script>

<div class={className}>
	<Button size="sm">Save</Button>
	{@render children?.()}
</div>
