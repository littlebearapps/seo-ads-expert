import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import pino from 'pino';
import { StoreOptimization } from '../analyzers/edge-store-analyzer.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export class EdgeStoreAuditWriter {
  
  /**
   * Generate comprehensive Edge Store audit report
   */
  async writeEdgeStoreAudit(
    product: string,
    optimization: StoreOptimization,
    outputPath: string
  ): Promise<void> {
    logger.info(`Generating Edge Store audit for ${product}`);
    
    const content = this.generateAuditReport(product, optimization);
    
    // Ensure output directory exists
    mkdirSync(dirname(outputPath), { recursive: true });
    
    // Write the audit report
    writeFileSync(outputPath, content, 'utf-8');
    logger.info(`Edge Store audit written to: ${outputPath}`);
  }
  
  /**
   * Generate the complete audit report content
   */
  private generateAuditReport(product: string, analysis: StoreOptimization): string {
    const date = new Date().toLocaleDateString();
    
    return `# Edge Add-ons Store Audit - ${product}
*Generated on ${date} by SEO & Ads Expert v1.6*

## 🎯 Executive Summary

This audit analyzes your Edge Add-ons Store listing optimization opportunities based on **${analysis.keywordCount} high-performing keywords** with **${analysis.totalVolume.toLocaleString()} monthly searches**.

### Expected Impact
- 📈 **Discoverability**: +${analysis.expectedLift.discoverability}%
- 🎯 **Click-Through Rate**: +${analysis.expectedLift.ctr}%  
- 🚀 **Install Rate**: +${analysis.expectedLift.installs}%

---

## 📝 Title Optimization

### Current Title
\`\`\`
${analysis.currentTitle} (${analysis.currentTitle.length} characters)
\`\`\`

### 🏆 Recommended Title Variants

${analysis.titleVariants.map((variant, i) => `
#### Option ${i + 1}: ${variant.characterCount <= 45 ? '✅' : '⚠️'} ${variant.characterCount}/45 characters
\`\`\`
${variant.title}
\`\`\`
- **Reasoning**: ${variant.reasoning}
- **Keywords Targeted**: ${variant.keywords.join(', ')}
${variant.expectedCTR ? `- **Expected CTR Lift**: +${(variant.expectedCTR * 100).toFixed(1)}%` : ''}
`).join('')}

### 💡 Title Optimization Tips
- Keep under 45 characters for full visibility
- Lead with your strongest keyword
- Include "Chrome Extension" or "Edge Add-on" for clarity
- Avoid special characters that may not display correctly

---

## 📄 Description Optimization

### A/B Testing Candidates

${analysis.descriptionVariants.map(variant => `
#### ${variant.type.charAt(0).toUpperCase() + variant.type.slice(1).replace('-', ' ')} Approach

**Short Description** (${variant.short.length}/132 characters):
> ${variant.short}

**Detailed Description Outline**:
${variant.detailed}

**Keywords Naturally Integrated**: ${variant.keywords.slice(0, 5).join(', ')}

---
`).join('')}

### 📏 Description Best Practices
- **Short Description**: 80-132 characters optimal
- **Detailed Description**: 200+ characters with bullet points
- **Keywords**: Integrate naturally, avoid stuffing
- **Call-to-Action**: Include clear next steps

---

## 🔑 Keyword Strategy

### Current Keywords Analysis
${analysis.keywordRecommendations.filter(r => r.action === 'keep').length > 0 ? `
#### ✅ Keep These Keywords (${analysis.keywordRecommendations.filter(r => r.action === 'keep').length})
${analysis.keywordRecommendations
  .filter(r => r.action === 'keep')
  .map(k => `- **${k.keyword}** (${k.volume} searches/month) - ${k.reasoning}`)
  .join('\n')}
` : ''}

### 🎯 High-Priority Additions
${analysis.keywordRecommendations.filter(r => r.action === 'add').slice(0, 8).map(k => 
  `- **${k.keyword}** - ${k.volume.toLocaleString()} searches/month  
  *${k.reasoning}*`
).join('\n')}

${analysis.keywordRecommendations.filter(r => r.action === 'remove').length > 0 ? `
### 🗑️ Consider Removing
${analysis.keywordRecommendations
  .filter(r => r.action === 'remove')
  .map(k => `- ~~${k.keyword}~~ - ${k.reasoning}`)
  .join('\n')}
` : ''}

### 🎲 Keyword Research Insights
- **Total Search Volume**: ${analysis.totalVolume.toLocaleString()} monthly searches
- **Primary Theme**: Chrome extension tools
- **Long-tail Opportunities**: Specific use cases and benefits
- **Competitive Keywords**: Focus on unique value propositions

---

## 🖼️ Asset Optimization Checklist

${analysis.assetChecklist.map(item => {
  const status = item.present ? '✅ **GOOD**' : '❌ **NEEDS WORK**';
  return `### ${status} ${item.asset}
**Status**: ${item.recommendation}
${this.getAssetGuidance(item.asset, item.present)}

`;
}).join('')}

---

## 🎯 Action Plan (Prioritized)

${analysis.prioritizedActions.map((action, i) => `
### ${i + 1}. ${action}
${this.getActionGuidance(action, i)}
`).join('')}

---

## 📊 Competitive Intelligence

### Market Positioning
- **Category**: Developer Tools / Productivity
- **Target Audience**: Designers, developers, digital professionals
- **Unique Value Prop**: Advanced features + ease of use

### Recommended Messaging
- **Primary**: "Professional-grade tools made simple"
- **Secondary**: "Save hours of manual work"  
- **Proof Points**: "Trusted by 10,000+ professionals"

### Competitor Analysis
- **Differentiation**: Emphasize unique features
- **Price Positioning**: Highlight free tier benefits
- **Social Proof**: User testimonials and usage stats

---

## 📈 Performance Tracking

### Key Metrics to Monitor
1. **Store Impressions** - Track keyword visibility
2. **Click-Through Rate** - Measure title/description effectiveness  
3. **Install Rate** - Overall listing conversion
4. **User Ratings** - Quality feedback loop
5. **Search Rankings** - Position for target keywords

### Optimization Timeline
- **Week 1**: Implement title and description changes
- **Week 2**: Update keywords and add screenshots
- **Week 3**: Create and upload demo video
- **Week 4**: A/B test description variants
- **Month 2+**: Monitor performance and iterate

### Success Benchmarks
- **Discoverability**: ${analysis.expectedLift.discoverability}%+ improvement in impressions
- **CTR**: ${analysis.expectedLift.ctr}%+ improvement in click rate  
- **Installs**: ${analysis.expectedLift.installs}%+ improvement in conversion rate

---

## 🛠️ Implementation Checklist

### Immediate Actions (This Week)
- [ ] Update title to highest-scoring variant
- [ ] Implement benefit-led short description  
- [ ] Add top 5 recommended keywords
- [ ] Take 2 additional screenshots

### Short-term Actions (Next 2 Weeks)  
- [ ] Create 30-60 second demo video
- [ ] Write detailed description with bullet points
- [ ] Remove low-relevance keywords
- [ ] Set up tracking dashboard

### Long-term Monitoring (Ongoing)
- [ ] Weekly performance review
- [ ] Monthly keyword research updates
- [ ] Quarterly competitive analysis
- [ ] Bi-annual full audit refresh

---

## 📞 Support Resources

### Edge Add-ons Store Guidelines
- [Microsoft Edge Add-ons Developer Policies](https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/)
- [Store Listing Best Practices](https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/store-policies/)

### Optimization Tools
- **Microsoft Edge Add-ons Developer Dashboard**: Store analytics
- **Edge DevTools**: Extension debugging
- **Store Preview Tool**: Test listing appearance

### Professional Services
For advanced optimization or custom implementation, consider consulting with:
- Microsoft Partner Network members
- Edge extension development specialists
- Store optimization consultants

---

*This audit was generated using live search data and industry best practices. Results may vary based on market conditions and implementation quality.*

**Generated by**: SEO & Ads Expert v1.6  
**Date**: ${date}  
**Keywords Analyzed**: ${analysis.keywordCount}  
**Total Search Volume**: ${analysis.totalVolume.toLocaleString()}`;
  }
  
  /**
   * Get asset-specific guidance
   */
  private getAssetGuidance(asset: string, isPresent: boolean): string {
    if (asset.includes('Title')) {
      return isPresent ? 
        `Good character count. Consider A/B testing variants to improve CTR.` :
        `**Action Required**: Shorten title for better visibility in search results.`;
    }
    
    if (asset.includes('Short Description')) {
      return isPresent ?
        `Length is appropriate for Edge store preview. Ensure it includes primary keywords.` :
        `**Action Required**: Optimize length and include compelling benefits.`;
    }
    
    if (asset.includes('Screenshots')) {
      return isPresent ?
        `Good visual coverage. Consider adding captions and highlighting key features.` :
        `**Action Required**: Add screenshots showing main features, UI, and use cases.`;
    }
    
    if (asset.includes('Video')) {
      return isPresent ?
        `Video present. Ensure it's under 60 seconds and shows core functionality.` :
        `**Recommendation**: Create short demo showing 2-3 key features in action.`;
    }
    
    if (asset.includes('Keywords')) {
      return isPresent ?
        `Keyword count in optimal range. Focus on relevance over quantity.` :
        `**Action Required**: Research and add relevant keywords from analysis above.`;
    }
    
    return 'Review and optimize based on Edge Add-ons Store guidelines.';
  }
  
  /**
   * Get action-specific guidance
   */
  private getActionGuidance(action: string, index: number): string {
    if (action.includes('title')) {
      return `**Implementation**: Update in Developer Dashboard → Store listing → Basic info
**Timeline**: Immediate (takes effect within 24 hours)
**Impact**: High - directly affects search visibility and CTR`;
    }
    
    if (action.includes('keywords')) {
      return `**Implementation**: Developer Dashboard → Store listing → Keywords section
**Timeline**: 1-2 hours research + implementation  
**Impact**: Medium-High - improves discoverability over 2-4 weeks`;
    }
    
    if (action.includes('assets')) {
      return `**Implementation**: Create missing assets then upload via Developer Dashboard
**Timeline**: 2-5 days depending on asset type
**Impact**: Medium - improves conversion rate and user trust`;
    }
    
    if (action.includes('description')) {
      return `**Implementation**: A/B test different variants over 2-4 week periods
**Timeline**: 1-2 hours to implement, 4+ weeks to measure
**Impact**: Medium - affects conversion rate from store visits to installs`;
    }
    
    return `**Priority ${index + 1}**: Implement according to timeline in Performance Tracking section above.`;
  }
}