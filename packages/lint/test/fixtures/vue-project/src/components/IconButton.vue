<script setup lang="ts">
import { Button } from "@/components/ui/button"

defineProps<{
  label: string
}>()
</script>

<template>
  <Button size="sm" :aria-label="label">
    <slot />
  </Button>
</template>
