#!/bin/bash

# Phase 1 Test Script - Verifies CLAIM JSON enforcement
set -e

echo "==========================================="
echo "Phase 1 Test: CLAIM JSON Enforcement"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directory
TEST_DIR="testblog"
VERIFICATION_DIR=".claude/verification"

# Clean up previous test
echo -e "${YELLOW}Cleaning up previous test...${NC}"
rm -rf "$TEST_DIR"/*.md
rm -f "$VERIFICATION_DIR"/*.json
mkdir -p "$TEST_DIR"
mkdir -p "$VERIFICATION_DIR"

# Start monitoring server if not running
if ! pgrep -f "monitoring/server.js" > /dev/null; then
    echo -e "${YELLOW}Starting monitoring server...${NC}"
    if [ -f "monitoring/server.js" ]; then
        node monitoring/server.js &
        MONITOR_PID=$!
        sleep 2
    else
        echo -e "${YELLOW}Monitoring server not available, continuing without dashboard${NC}"
    fi
fi

echo -e "${GREEN}✓ Setup complete${NC}"
echo ""

# Create test commitment
echo -e "${YELLOW}Creating test commitment...${NC}"
TASK_ID="task-$(date +%s)"
cat > "$VERIFICATION_DIR/commitment.json" << EOF
{
  "task_id": "$TASK_ID",
  "type": "content",
  "profile": "content_default",
  "user_instruction": "Create 3 blog posts about AI, 300 words each",
  "commitments": {
    "expected_total": 3,
    "quality": {
      "word_min": 300,
      "coverage": 1.0
    },
    "scope": {
      "target_directory": "testblog",
      "files": [],
      "functions": [],
      "endpoints": []
    }
  },
  "timestamp": "$(date -Iseconds)"
}
EOF

echo -e "${GREEN}✓ Commitment created for task: $TASK_ID${NC}"

# Simulate Claude creating blog posts
echo -e "${YELLOW}Simulating Claude's work...${NC}"

# Create actual blog posts
cat > "$TEST_DIR/ai-future.md" << 'EOF'
# The Future of AI

Artificial Intelligence is rapidly transforming our world in unprecedented ways. From healthcare to transportation, AI systems are becoming increasingly sophisticated and capable of tasks that were once thought to be exclusively human domains.

Machine learning algorithms now power recommendation systems that influence what we watch, read, and buy. Natural language processing has evolved to the point where AI can engage in nuanced conversations and even create original content. Computer vision systems can identify objects and patterns with superhuman accuracy.

The implications of these advances are profound. In medicine, AI assists doctors in diagnosing diseases earlier and more accurately than ever before. In scientific research, AI accelerates discovery by analyzing vast datasets and identifying patterns humans might miss. In creative fields, AI tools augment human creativity, enabling new forms of artistic expression.

However, this rapid progress also raises important questions about privacy, employment, and the nature of intelligence itself. As AI systems become more autonomous, we must carefully consider how to ensure they remain aligned with human values and goals. The development of artificial general intelligence (AGI) could represent one of the most significant turning points in human history.

Looking ahead, the next decade promises even more remarkable developments. Quantum computing may unlock new possibilities for AI processing power. Brain-computer interfaces could create direct connections between human minds and artificial systems. The boundaries between human and artificial intelligence may become increasingly blurred. These advances will require new frameworks for understanding intelligence.

As we stand on the brink of this new era, it's crucial that we approach AI development thoughtfully and inclusively. The decisions we make today about AI governance, ethics, and deployment will shape the trajectory of human civilization for generations to come. By working together, we can harness the tremendous potential of AI while navigating its challenges responsibly.
EOF

cat > "$TEST_DIR/ai-ethics.md" << 'EOF'
# Ethics in Artificial Intelligence

The rapid advancement of artificial intelligence technology has brought ethical considerations to the forefront of technological discourse. As AI systems become more powerful and pervasive, the need for robust ethical frameworks becomes increasingly urgent.

One of the primary ethical challenges involves bias in AI systems. Machine learning models trained on historical data often perpetuate and amplify existing societal biases. This can lead to discriminatory outcomes in critical areas such as hiring, lending, and criminal justice. Addressing these biases requires diverse teams, comprehensive testing, and ongoing monitoring of AI systems in deployment.

Privacy represents another significant ethical concern. AI systems often require vast amounts of data to function effectively, raising questions about consent, data ownership, and surveillance. The ability of AI to analyze and predict human behavior creates unprecedented opportunities for manipulation and control. Balancing the benefits of AI-driven insights with individual privacy rights remains a complex challenge.

Transparency and explainability pose additional ethical dilemmas. Many advanced AI systems operate as "black boxes," making decisions through processes that even their creators cannot fully explain. This lack of transparency becomes particularly problematic in high-stakes applications like healthcare diagnostics or autonomous vehicles. The push for explainable AI seeks to address this issue, but technical solutions remain limited.

The question of accountability looms large as AI systems assume greater decision-making authority. When an autonomous vehicle causes an accident or an AI system makes a harmful recommendation, determining responsibility becomes complex. Legal and regulatory frameworks struggle to keep pace with technological advancement, creating gaps in accountability structures.

As we navigate these ethical challenges, multistakeholder collaboration becomes essential. Technologists, ethicists, policymakers, and civil society must work together to develop governance frameworks that promote beneficial AI while mitigating risks. The goal is not to restrict innovation but to ensure that AI development serves humanity's best interests.
EOF

cat > "$TEST_DIR/ai-education.md" << 'EOF'
# AI in Education: Transforming Learning

Artificial intelligence is revolutionizing education, offering personalized learning experiences and new tools for both students and educators. This transformation promises to make quality education more accessible and effective for learners worldwide.

Adaptive learning systems represent one of AI's most impactful applications in education. These systems analyze individual student performance in real-time, adjusting difficulty levels and content presentation to match each learner's pace and style. This personalization helps struggling students receive additional support while allowing advanced learners to progress more quickly. The result is more efficient and effective learning outcomes for all students.

AI-powered tutoring systems provide round-the-clock support, offering explanations, answering questions, and providing feedback without the constraints of human availability. Natural language processing enables these systems to understand student queries and respond in conversational ways. While not replacing human teachers, these tools supplement traditional instruction and provide additional practice opportunities.

Assessment and feedback processes benefit significantly from AI integration. Automated grading systems can evaluate not just multiple-choice questions but also essays and complex problem-solving tasks. More importantly, AI can provide detailed, immediate feedback that helps students understand their mistakes and learn from them. This rapid feedback loop accelerates the learning process and keeps students engaged.

For educators, AI tools offer valuable insights into student progress and learning patterns. Analytics dashboards highlight areas where students struggle collectively, enabling teachers to adjust their instruction accordingly. AI can also handle administrative tasks like attendance tracking and progress reporting, freeing teachers to focus on instruction and student interaction.

Despite these benefits, implementing AI in education requires careful consideration of equity and access issues. Not all students have equal access to technology, and over-reliance on AI tools could exacerbate existing educational inequalities. Additionally, the human elements of education – mentorship, social interaction, and emotional support – remain irreplaceable. The most effective approach combines AI's capabilities with human wisdom and empathy.
EOF

echo -e "${GREEN}✓ Created 3 blog posts${NC}"

# Create CLAIM JSON (simulating what Claude should output - canonical v1.1)
echo -e "${YELLOW}Creating CLAIM JSON (v1.1 format)...${NC}"
TIMESTAMP=$(date -Iseconds)
REPO_ROOT=$(pwd)
cat > "$VERIFICATION_DIR/claim.json" << EOF
{
  "schema": "verify.claim/v1.1",
  "actor": "claude",
  "task_id": "$TASK_ID",
  "timestamp": "$TIMESTAMP",
  "claim": {
    "type": "content",
    "units_total": 3,
    "units_list": ["ai-future.md", "ai-ethics.md", "ai-education.md"],
    "scope": {
      "repo_root": "$REPO_ROOT",
      "targets": ["testblog"],
      "files": [
        "testblog/ai-future.md",
        "testblog/ai-ethics.md",
        "testblog/ai-education.md"
      ]
    },
    "declared": {
      "intent": "Create 3 blog posts about AI with minimum 300 words each",
      "approach": "Generated comprehensive content covering future, ethics, and education aspects of AI",
      "completion_status": "complete"
    }
  }
}
EOF

echo -e "${GREEN}✓ CLAIM JSON created${NC}"

# Send commitment to monitoring server
echo -e "${YELLOW}Sending commitment to monitoring server...${NC}"
curl -X POST http://localhost:4000/api/commitment \
  -H "Content-Type: application/json" \
  -d @"$VERIFICATION_DIR/commitment.json" \
  --silent --output /dev/null || true

# Send claim to monitoring server
echo -e "${YELLOW}Sending claim to monitoring server...${NC}"
curl -X POST http://localhost:4000/api/claim \
  -H "Content-Type: application/json" \
  -d @"$VERIFICATION_DIR/claim.json" \
  --silent --output /dev/null || true

# Run verification
echo -e "${YELLOW}Running verification...${NC}"
echo ""

node -e "
import { ContentAdapter } from './src/adapters/content.mjs';
import { promises as fs } from 'fs';

async function runVerification() {
    try {
        // Load commitment and claim
        const commitmentData = await fs.readFile('$VERIFICATION_DIR/commitment.json', 'utf8');
        const claimData = await fs.readFile('$VERIFICATION_DIR/claim.json', 'utf8');

        const commitment = JSON.parse(commitmentData);
        const claim = JSON.parse(claimData);

        // Collect artifacts
        const adapter = new ContentAdapter();
        const artifacts = await adapter.collectArtifacts('$TEST_DIR');

        console.log('Artifacts found:', artifacts.content?.files?.map(f => f.path).join(', ') || 'none');
        console.log('');

        // Run verification
        const verification = await adapter.verify(commitment, claim, artifacts);

        // Create verdict
        const verdict = {
            task_id: commitment.task_id,
            status: verification.units_verified >= commitment.commitments.expected_total ? 'pass' : 'fail',
            units_expected: commitment.commitments.expected_total,
            units_verified: verification.units_verified,
            per_unit: verification.per_unit,
            reasons: verification.reasons,
            metrics: verification.metrics,
            policy: {
                profile: commitment.profile,
                thresholds: { word_min: commitment.commitments.quality.word_min }
            },
            timestamp: new Date().toISOString()
        };

        // Display results
        console.log('=========================================');
        console.log('VERIFICATION RESULTS');
        console.log('=========================================');
        console.log('Status:', verdict.status === 'pass' ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m');
        console.log('Expected units:', verdict.units_expected);
        console.log('Verified units:', verdict.units_verified);
        console.log('');
        console.log('Per-unit results:');
        verdict.per_unit.forEach(unit => {
            const status = unit.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
            console.log('  ' + status + ' ' + unit.id + (unit.reason ? ' - ' + unit.reason : ''));
        });
        console.log('');
        console.log('Metrics:');
        Object.entries(verdict.metrics).forEach(([key, value]) => {
            console.log('  ' + key + ':', value);
        });

        // Save verdict
        await fs.writeFile('$VERIFICATION_DIR/verdict.json', JSON.stringify(verdict, null, 2));

        // Send to monitoring server
        try {
            const response = await fetch('http://localhost:4000/api/verdict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(verdict)
            });
        } catch (e) {
            // Ignore if monitoring server not available
        }

        if (verdict.status === 'pass') {
            console.log('');
            console.log('\x1b[32m✅ Phase 1 Test PASSED!\x1b[0m');
            console.log('CLAIM JSON enforcement is working correctly.');
        } else {
            console.log('');
            console.log('\x1b[31m❌ Phase 1 Test FAILED\x1b[0m');
            console.log('Reasons:', verdict.reasons.join(', '));
        }

    } catch (error) {
        console.error('\x1b[31mError running verification:\x1b[0m', error.message);
        process.exit(1);
    }
}

runVerification();
" 2>&1

echo ""
echo "==========================================="
echo -e "${GREEN}Phase 1 Test Complete${NC}"
echo "==========================================="
echo ""
echo "Check the dashboard at: http://localhost:4000/"
echo "You should see:"
echo "  - Commitment data (expected: 3 units, 300 words min)"
echo "  - Claim data (claimed: 3 units created)"
echo "  - Verdict data (verified: 3 units, PASS status)"
echo ""
echo "To test with real Claude:"
echo "  1. Open Claude in the mcp-gemini-adjudicator folder"
echo "  2. Provide the CLAIM JSON instructions from claude-wrapper.md"
echo "  3. Ask: 'Create 3 blog posts about AI, 300 words each'"
echo "  4. Verify Claude outputs CLAIM JSON at the end"