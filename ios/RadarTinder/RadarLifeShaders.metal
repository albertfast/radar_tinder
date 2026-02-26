#include <metal_stdlib>
using namespace metal;

struct RadarVertexIn {
  float2 position [[attribute(0)]];
  float4 color [[attribute(1)]];
};

struct RadarVertexOut {
  float4 position [[position]];
  float4 color;
};

vertex RadarVertexOut radarVertex(RadarVertexIn in [[stage_in]]) {
  RadarVertexOut out;
  out.position = float4(in.position, 0.0, 1.0);
  out.color = in.color;
  return out;
}

fragment float4 radarFragment(RadarVertexOut in [[stage_in]]) {
  return in.color;
}
