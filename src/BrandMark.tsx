import React from "react";
import { Image } from "react-native";

const icon = require("../assets/brand/icon.png");

export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={icon}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.25),
      }}
      accessible={false}
    />
  );
}
