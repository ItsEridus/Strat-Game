package main

import (
	"strconv"
	"strings"
)

// newer reports whether tag a (v1.2.3) is a later version than b.
func newer(a, b string) bool {
	pa, pb := parseVer(a), parseVer(b)
	if pa == nil || pb == nil {
		return false
	}
	for i := 0; i < 3; i++ {
		if pa[i] != pb[i] {
			return pa[i] > pb[i]
		}
	}
	return false
}

func parseVer(v string) []int {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	parts := strings.SplitN(v, ".", 3)
	if len(parts) != 3 {
		return nil
	}
	out := make([]int, 3)
	for i, p := range parts {
		n, err := strconv.Atoi(strings.SplitN(p, "-", 2)[0])
		if err != nil {
			return nil
		}
		out[i] = n
	}
	return out
}

