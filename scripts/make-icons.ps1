# Generates the extension icons (blue tile with a white signature stroke).
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\extension\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

foreach ($size in 16, 32, 48, 128) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = $size / 128.0
    $radius = 28 * $s
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $radius
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 44, 85, 214))), $path)

    $penWidth = [Math]::Max(1.6, 9 * $s)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $penWidth
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    # Signature flourish
    $points = @(
        (New-Object System.Drawing.PointF (22 * $s), (78 * $s)),
        (New-Object System.Drawing.PointF (34 * $s), (30 * $s)),
        (New-Object System.Drawing.PointF (44 * $s), (96 * $s)),
        (New-Object System.Drawing.PointF (58 * $s), (60 * $s)),
        (New-Object System.Drawing.PointF (68 * $s), (40 * $s)),
        (New-Object System.Drawing.PointF (76 * $s), (82 * $s)),
        (New-Object System.Drawing.PointF (106 * $s), (58 * $s))
    )
    $g.DrawCurve($pen, $points, 0.6)

    # Baseline
    $thin = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 255, 255, 255)), ([Math]::Max(1, 5 * $s))
    $thin.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $thin.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($thin, (22 * $s), (106 * $s), (106 * $s), (106 * $s))

    $bmp.Save((Join-Path $outDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "icons/icon-$size.png"
}
