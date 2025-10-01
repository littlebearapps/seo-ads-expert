/**
 * Product type definitions for v1.8 integration
 */

import type { FAQ } from '../schema/types.js';

/**
 * Product data structure used throughout the v1.8 system
 */
export interface Product {
  // Basic product information
  name: string;
  displayName?: string;
  description?: string;
  url?: string;
  category?: string;

  // Product attributes
  features?: string[];
  benefits?: string[];
  keywords?: string[];

  // Pricing information
  price?: number | string;
  priceRange?: string;
  currency?: string;

  // FAQ data
  faqs?: FAQ[];

  // Reviews and ratings
  rating?: number;
  ratingCount?: number;
  reviews?: Array<{
    author?: string;
    rating?: number;
    text?: string;
    date?: string;
  }>;

  // Schema-related fields
  brand?: string;
  logo?: string;
  screenshot?: string;
  downloadUrl?: string;
  applicationCategory?: string;
  operatingSystem?: string;

  // SEO and content fields
  entities?: Array<{
    canonical: string;
    variants: string[];
    importance: number;
  }>;
  contentGaps?: string[];

  // Metadata
  market?: string;
  language?: string;
  lastUpdated?: string;
}

/**
 * Product configuration for different Little Bear Apps products
 */
export const PRODUCT_CONFIGS: Record<string, Partial<Product>> = {
  convertmyfile: {
    name: 'ConvertMyFile',
    displayName: 'Convert My File - Free Online Converter',
    description: 'Free online file conversion tool supporting 100+ formats',
    url: 'https://littlebearapps.com/convertmyfile',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web',
    brand: 'Little Bear Apps',
    features: [
      'Support for 100+ file formats',
      'No file size limits',
      'Secure file processing',
      'No registration required',
      'Batch conversion support'
    ],
    benefits: [
      'Save time with instant conversions',
      'Access from any device',
      'Preserve file quality',
      'Protect your privacy'
    ]
  },
  palettekit: {
    name: 'PaletteKit',
    displayName: 'PaletteKit - Color Palette Generator',
    description: 'Chrome extension for extracting and managing color palettes from any website',
    url: 'https://littlebearapps.com/palettekit',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Chrome',
    brand: 'Little Bear Apps',
    features: [
      'Extract colors from any webpage',
      'Generate harmonious color palettes',
      'Export to multiple formats',
      'Color contrast checker',
      'Accessibility compliance tools'
    ],
    benefits: [
      'Speed up design workflow',
      'Ensure brand consistency',
      'Meet accessibility standards',
      'Share palettes with team'
    ]
  },
  notebridge: {
    name: 'NoteBridge',
    displayName: 'NoteBridge - Smart Note Taking',
    description: 'Intelligent note-taking Chrome extension with AI-powered organization',
    url: 'https://littlebearapps.com/notebridge',
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Chrome',
    brand: 'Little Bear Apps',
    features: [
      'AI-powered note organization',
      'Cross-tab note synchronization',
      'Smart search and filtering',
      'Export to multiple formats',
      'Collaborative note sharing'
    ],
    benefits: [
      'Never lose important information',
      'Find notes instantly',
      'Organize thoughts effortlessly',
      'Collaborate seamlessly'
    ]
  }
};