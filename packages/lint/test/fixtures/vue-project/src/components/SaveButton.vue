<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Button :class="cn('gap-2', props.class)">
    <slot />
  </Button>
</template>
