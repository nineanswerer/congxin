#!/usr/bin/env python3
"""把交付 ZIP 里 `scf_bootstrap` 的 Unix 权限补成 0755。

## 为什么需要这个脚本（11-21）

官方 helper 的归档器（`create_project_archive.py`）按**源文件的 exec 位**写 ZIP 条目权限：

    mode = 0o755 if source.stat().st_mode & 0o111 else 0o644
    info.external_attr = (stat.S_IFREG | mode) << 16

但我们是在 **Windows / NTFS** 上准备交付包的：

- NTFS 没有 Unix exec 位；
- Python 的 `os.chmod` 在 Windows 上只切换「只读」属性，`st_mode` 永远是 `0o666`。

结果就是：**ZIP 里 `scf_bootstrap` 变成 0644** → 平台解包后启动文件不可执行 →
平台自己的校验步骤 `test -x scf_bootstrap` 会失败 → **部署直接挂**。

这个脚本把「Linux 上本来就会产生的 0755」补进 ZIP 条目，
并且在写完之后**逐项复检**（不是只改了就交差）：

1. CRC 全量校验（`testzip()` 返回 None）；
2. 成员清单与改写前**完全一致**（数量、顺序、名字）；
3. 每个成员的内容 SHA-256 与改写前**逐一相同**（证明只动了权限、没动内容）；
4. `scf_bootstrap` 的条目权限确实是 0755，其余成员权限未被改动；
5. 所有条目的 `create_system` 保持 3（Unix），否则 Linux 解包会忽略权限位。

## 用法

    python scripts/fix-zip-exec-bit.py <zip 路径>

退出码：0 = 补好了且复检全过；1 = 有问题（原因会打印出来）。
"""

import hashlib
import os
import shutil
import stat
import sys
import tempfile
import zipfile

TARGET = "scf_bootstrap"
TARGET_MODE = 0o755


def member_mode(info: zipfile.ZipInfo) -> int:
    return stat.S_IMODE(info.external_attr >> 16)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if len(sys.argv) != 2:
        print("用法：python scripts/fix-zip-exec-bit.py <zip 路径>", file=sys.stderr)
        return 1
    zip_path = os.path.abspath(sys.argv[1])
    if not os.path.isfile(zip_path):
        print(f"找不到 ZIP：{zip_path}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        originals = {name: archive.read(name) for name in names}
        infos = {info.filename: info for info in archive.infolist()}
        before_modes = {name: member_mode(infos[name]) for name in names}

    target_names = [name for name in names if name.split("/")[-1] == TARGET]
    if not target_names:
        print(f"ZIP 里没有 {TARGET}，不动它。", file=sys.stderr)
        return 1

    already = all(before_modes[name] == TARGET_MODE for name in target_names)
    if already:
        print(f"{TARGET} 已经是 0755，不用改。")
        return 0

    handle, temp_name = tempfile.mkstemp(prefix=".fix-zip-", suffix=".tmp", dir=os.path.dirname(zip_path))
    os.close(handle)
    try:
        with zipfile.ZipFile(temp_name, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in names:
                source = infos[name]
                info = zipfile.ZipInfo(name, source.date_time)
                info.create_system = 3
                info.compress_type = zipfile.ZIP_DEFLATED
                mode = TARGET_MODE if name in target_names else before_modes[name]
                info.external_attr = (stat.S_IFREG | mode) << 16
                archive.writestr(info, originals[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

        # ---------------------------------------------------------- 复检
        with zipfile.ZipFile(temp_name) as archive:
            corrupt = archive.testzip()
            if corrupt is not None:
                raise SystemExit(f"改写后的 ZIP CRC 校验失败：{corrupt}")
            after_names = archive.namelist()
            if after_names != names:
                raise SystemExit("改写后的 ZIP 成员清单跟改写前不一致")
            for name in names:
                data = archive.read(name)
                if sha256(data) != sha256(originals[name]):
                    raise SystemExit(f"改写后的 ZIP 成员内容变了：{name}")
                info = archive.getinfo(name)
                if info.create_system != 3:
                    raise SystemExit(f"{name} 的 create_system 不是 3，Linux 解包会忽略权限位")
                expected_mode = TARGET_MODE if name in target_names else before_modes[name]
                if member_mode(info) != expected_mode:
                    raise SystemExit(f"{name} 的权限不是预期的 {oct(expected_mode)}")
                if name in target_names and member_mode(info) != TARGET_MODE:
                    raise SystemExit(f"{TARGET} 的权限不是 0755")

        shutil.move(temp_name, zip_path)
    finally:
        if os.path.exists(temp_name):
            os.remove(temp_name)

    print(f"已把 {TARGET} 的权限补成 0755：{zip_path}")
    for name in target_names:
        print(f"  {name}: {oct(before_modes[name])} → {oct(TARGET_MODE)}")
    print("复检通过：CRC、成员清单、逐成员内容哈希、权限位、create_system 全部一致")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
