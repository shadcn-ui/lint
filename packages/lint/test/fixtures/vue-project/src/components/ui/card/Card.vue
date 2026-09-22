<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div :class="cn('bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6', props.class)">
    <slot />
  </div>
</template>
