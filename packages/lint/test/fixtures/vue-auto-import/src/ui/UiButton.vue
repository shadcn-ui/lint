<script setup lang="ts">
const props = defineProps<{ class?: string }>()
</script>

<template>
  <button :class="['inline-flex h-9 px-4', props.class]">
    <slot />
  </button>
</template>
