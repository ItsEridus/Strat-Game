package main

import "testing"

func TestNewer(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"v1.3.0", "v1.2.0", true},
		{"v1.2.10", "v1.2.9", true},
		{"v1.2.0", "v1.2.0", false},
		{"v1.1.9", "v1.2.0", false},
		{"v2.0.0", "1.9.9", true},
		{"v1.3.0-beta", "v1.2.0", true},
		{"dev", "v1.0.0", false},
		{"v1.0.0", "dev", false},
	}
	for _, c := range cases {
		if got := newer(c.a, c.b); got != c.want {
			t.Errorf("newer(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
