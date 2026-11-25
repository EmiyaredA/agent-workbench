import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlInput } from '../src/cli-input.mjs';

test('XML preserves multiline Markdown, entities, adjacent CDATA and explicit field types',()=>{
  const parsed = parseXmlInput('\uFEFF<?xml version="1.0" encoding="UTF-8"?>\r\n<change>\n<!-- input -->\n<file> AGENTS.md </file><content><![CDATA[# 标题\r\n\n```js\nconst x = "<tag> & \\\"";\n```\n]]]]><![CDATA[>]]></content><baseHash/><title>&lt;A&gt; &amp; &quot;B&quot; &apos;C&apos; &#20013; &#x1F600;</title></change>','change');
  assert.equal(parsed.content,'# 标题\n\n```js\nconst x = "<tag> & \\\"";\n```\n]]>');
  assert.equal(parsed.file,'AGENTS.md');assert.equal(parsed.baseHash,null);
  assert.equal(parsed.title,'<A> & "B" \'C\' 中 😀');
  assert.deepEqual(parseXmlInput('<record><relatedFiles><file>AGENTS.md</file><file>.agent-workbench/rules/index.md</file></relatedFiles><decisionFiles/></record>','record'),{relatedFiles:['AGENTS.md','.agent-workbench/rules/index.md'],decisionFiles:[]});
});

test('XML rejects ambiguous or unsupported input before exposing field values',()=>{
  for (const input of [
    '<record><title>A</title><title>B</title></record>',
    '<record><unknown>value</unknown></record>',
    '<change/>', '<record/><record/>', 'outside<record/>',
    '<record><title>not closed</record>', '<record><title>',
    '<record version="1"><title>attribute</title></record>',
    '<!DOCTYPE record [<!ENTITY x SYSTEM "file:///etc/passwd">]><record><result>&x;</result></record>',
    '<record><result>&unknown;</result></record>',
    '<record><result>bare &</result></record>',
    '<record><result>&#0;</result></record>',
    '<record><result>\u0000</result></record>',
    '<record><result><b>nested markup</b></result></record>',
    '<record><relatedFiles><item>AGENTS.md</item></relatedFiles></record>',
    '<record><relatedFiles>AGENTS.md</relatedFiles></record>',
    '<record><!-- bad -- comment --></record>',
    '<record><result>bad ]]></result></record>',
    '<record><result><![CDATA[unclosed</result></record>'
  ]) assert.throws(()=>parseXmlInput(input,'record'),/XML 输入/,input);
});
