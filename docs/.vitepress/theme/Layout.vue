<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
    <template v-if="frontmatter.layout === 'home'" #home-hero-image>
      <div class="hero-video-wrapper">
        <video autoplay muted loop playsinline>
          <source src="/videos/dbackup-backup-restore.mp4" type="video/mp4">
        </video>
      </div>
    </template>
    <template #default>
      <slot />
    </template>
  </Layout>
</template>

<style scoped>
.hero-video-wrapper {
  position: relative;
  width: 100%;
  max-width: 550px;
  margin: 0 auto;
}

.hero-video-wrapper video {
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

@media (max-width: 1279px) {
  .hero-video-wrapper {
    display: none;
  }
}
</style>

<style>
@media (max-width: 1279px) {
  .VPHero .image-container {
    display: none !important;
  }

  .VPHero .container {
    padding-top: 100px !important;
  }
}
</style>
