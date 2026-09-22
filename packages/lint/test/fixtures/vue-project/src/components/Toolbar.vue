<script setup lang="ts">
import { Button } from "@/components/ui/button"
</script>

<template>
  <div class="flex gap-2">
    <Button size="sm">Save</Button>
    <slot />
  </div>
</template>
