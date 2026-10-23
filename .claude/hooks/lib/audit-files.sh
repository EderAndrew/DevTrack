#!/usr/bin/env bash
# Shared by security-check.sh and audit-complete.sh: one file filter and one hash algorithm for both.

# Extensions whose changes require an audit.
is_audited_code() {
    case "$1" in
        *.ts|*.tsx|*.js|*.jsx|*.py|*.java|*.go|*.rs|*.sql) return 0 ;;
        *) return 1 ;;
    esac
}

# SHA-256 of a file, or MISSING when it was deleted or renamed.
file_hash() {
    if [ -f "$1" ]; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        printf 'MISSING\n'
    fi
}

# Deterministic signature of every file listed in "$1".
calculate_hash() {
    while IFS= read -r file; do
        [ -n "$file" ] || continue
        if [ -f "$file" ]; then
            printf 'FILE:%s:%s\n' "$file" "$(file_hash "$file")"
        else
            printf 'MISSING:%s\n' "$file"
        fi
    done < <(LC_ALL=C sort -u "$1") |
        shasum -a 256 |
        awk '{print $1}'
}

# Code files that differ from HEAD (modified, deleted or untracked), as "<absolute path>\t<hash>".
# Comparing two snapshots shows what a Bash command changed (sed, heredoc, mv, generators).
dirty_code_snapshot() {
    local project_dir="$1" path
    git -C "$project_dir" ls-files -z -m -d -o --exclude-standard |
        while IFS= read -r -d '' path; do
            is_audited_code "$path" || continue
            printf '%s\t%s\n' "$project_dir/$path" "$(file_hash "$project_dir/$path")"
        done |
        LC_ALL=C sort -u
}
